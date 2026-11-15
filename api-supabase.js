// Real backend: talks to your Supabase project directly over HTTPS.
// No outside libraries, so nothing can hang while loading the page.
import { CONFIG } from "./config.js";

const URL_BASE = CONFIG.SUPABASE_URL;
const KEY = CONFIG.SUPABASE_ANON_KEY;
const STORE = "rmp-session-v1";
const TIMEOUT_MS = 20000;

let session = loadSession(); // { access_token, refresh_token, expires_at, email }
const listeners = [];

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
}
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch {}
  listeners.forEach((cb) => cb(s ? { email: s.email } : null));
}
function fromTokenResponse(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
    email: d.user?.email || emailFromJwt(d.access_token),
  };
}
function emailFromJwt(jwt) {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(part)))).email || "";
  } catch { return ""; }
}

function friendly(msg = "", status = 0) {
  if (/Database error saving new user/i.test(msg)) return "Only ESLSCA university email addresses can sign up.";
  if (/not authorized/i.test(msg) && /email/i.test(msg)) return "The site's email sender isn't set up yet, so the code can't be sent. (Site owner: connect custom SMTP in Supabase.)";
  if (status === 429 || /rate limit|too many|security purposes/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/expired|invalid/i.test(msg) && /otp|token|code/i.test(msg)) return "That code is wrong or has expired. Request a new one.";
  if (/does not exist|schema cache|Could not find the (function|table)/i.test(msg)) return "The database isn't set up yet. (Site owner: run supabase/schema.sql in the Supabase SQL Editor.)";
  if (/Invalid API key|No API key/i.test(msg)) return "The site's Supabase key is wrong. (Site owner: check SUPABASE_ANON_KEY in config.js.)";
  return msg || `Request failed (${status})`;
}

async function http(path, { method = "GET", body, auth = true, headers = {} } = {}) {
  const h = { apikey: KEY, "Content-Type": "application/json", ...headers };
  if (auth && session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  else if (KEY.startsWith("eyJ")) h.Authorization = `Bearer ${KEY}`; // legacy anon keys are JWTs and expect this header
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(URL_BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === "AbortError"
      ? "The database took too long to answer. Check your connection and try again."
      : "Couldn't reach the database. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.msg || data.error_description || data.error)) || "";
    const err = new Error(friendly(String(msg), res.status));
    err.status = res.status;
    err.raw = msg;
    throw err;
  }
  return data;
}

async function refresh() {
  if (!session?.refresh_token) return;
  try {
    const d = await http("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: session.refresh_token } });
    saveSession(fromTokenResponse(d));
  } catch (e) {
    if (e.status && e.status < 500) saveSession(null); // refresh token no longer valid: sign out
    throw e;
  }
}
async function ensureFresh() {
  if (session && session.expires_at - Math.floor(Date.now() / 1000) < 60) await refresh();
}
// Database calls: refresh the login if needed, and retry once if it expired mid-way.
async function db(path, opts = {}) {
  await ensureFresh();
  try {
    return await http(path, opts);
  } catch (e) {
    if (e.status === 401 && session?.refresh_token && /jwt|expired/i.test(e.raw || "")) {
      await refresh();
      return http(path, opts);
    }
    throw e;
  }
}
const rpc = (fn, args = {}) => db(`/rest/v1/rpc/${fn}`, { method: "POST", body: args });
const enc = encodeURIComponent;

// A sign-in link in the email brings the student back with tokens in the address bar.
(function readLinkTokens() {
  if (!/(^#|&)access_token=/.test(location.hash)) return;
  const p = new URLSearchParams(location.hash.slice(1));
  saveSession(fromTokenResponse({
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_in: p.get("expires_in"),
  }));
})();

export const api = {
  demo: false,

  async getSession() {
    if (!session) return null;
    try { await ensureFresh(); } catch {}
    return session ? { email: session.email } : null;
  },
  onAuthChange(cb) {
    listeners.push(cb);
  },
  async isEmailAllowed(email) {
    return http("/rest/v1/rpc/is_email_allowed", { method: "POST", auth: false, body: { p_email: email } });
  },
  async sendCode(email) {
    await http(`/auth/v1/otp?redirect_to=${enc(location.origin + location.pathname)}`, {
      method: "POST", auth: false, body: { email, create_user: true },
    });
  },
  async verifyCode(email, token) {
    const d = await http("/auth/v1/verify", { method: "POST", auth: false, body: { type: "email", email, token } });
    saveSession(fromTokenResponse(d));
  },
  async signOut() {
    try { await http("/auth/v1/logout", { method: "POST" }); } catch {}
    saveSession(null);
  },

  async getMyProfile() {
    return rpc("get_my_profile");
  },
  async listProfessors() {
    return db("/rest/v1/professor_stats?select=*&order=name.asc");
  },
  async getProfessor(id) {
    const rows = await db(`/rest/v1/professor_stats?select=*&id=eq.${enc(id)}`);
    return rows?.[0] || null;
  },
  async listReviews(professorId) {
    return db(`/rest/v1/review_feed?select=*&professor_id=eq.${enc(professorId)}&order=created_at.desc`);
  },
  async listCourses() {
    return db("/rest/v1/course_catalog?select=*&order=uses.desc&limit=500");
  },
  async myReviews() {
    return db("/rest/v1/my_reviews?select=*&order=created_at.desc");
  },
  async createProfessor(name, department) {
    return rpc("create_professor", { p_name: name, p_department: department });
  },
  async upsertReview(r) {
    return rpc("upsert_review", {
      p_professor_id: r.professor_id,
      p_course_name: r.course_name,
      p_course_code: r.course_code,
      p_semester: r.semester,
      p_overall: r.overall,
      p_clarity: r.clarity,
      p_fairness: r.fairness,
      p_workload: r.workload,
      p_helpfulness: r.helpfulness,
      p_would_take_again: r.would_take_again,
      p_grade: r.grade || null,
      p_comment: r.comment,
    });
  },
  async deleteReview(id) {
    await rpc("delete_my_review", { p_review_id: id });
  },
  async report({ reviewId = null, professorId = null, reason, details = "" }) {
    return rpc("report_content", {
      p_review_id: reviewId,
      p_professor_id: professorId,
      p_reason: reason,
      p_details: details,
    });
  },
};
