// DEMO backend: same functions as api-supabase.js, but data lives in this
// browser's localStorage. Used automatically when config.js has no Supabase keys.
// The login code in demo mode is always 123456.
import { CONFIG } from "./config.js";

const KEY = "rmp-demo-v2";
const BANNED = ["fuck", "shit", "bitch", "asshole", "a7a", "kosomak", "sharmota", "خول", "شرموط", "متناك", "عرص"];
const ADJ = ["Quiet", "Brave", "Clever", "Curious", "Swift", "Golden", "Silent", "Lucky", "Bold", "Calm", "Witty", "Lunar"];
const NOUN = ["Falcon", "Sphinx", "Pharaoh", "Lotus", "Scarab", "Ibis", "Oasis", "Papyrus", "Nile", "Owl", "Lynx", "Comet"];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const nameKey = (n) =>
  n.toLowerCase().trim()
    .replace(/^((prof|professor|dr|doctor|eng|mr|mrs|ms|د|دكتور|دكتورة)\.?\s+)+/u, "")
    .replace(/[\s\p{P}]+/gu, "");
const hasBanned = (t) =>
  t.toLowerCase().split(/[\s\p{P}]+/u).some((w) => BANNED.includes(w) || BANNED.includes(w.replace(/^ال/, "")) || BANNED.includes(w.replace(/(.)\1{2,}/g, "$1")));
const ckey = (name, code) => (name || "").trim() ? name.trim().replace(/\s+/g, " ").toLowerCase() : (code || "").toLowerCase();
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function seed() {
  const p1 = { id: uid(), name: "Dr. Demo Amr", department: CONFIG.DEPARTMENTS[0], hidden: false, created_at: new Date().toISOString() };
  const p2 = { id: uid(), name: "Dr. Demo Salma", department: CONFIG.DEPARTMENTS[1], hidden: false, created_at: new Date().toISOString() };
  const p3 = { id: uid(), name: "Prof. Demo Youssef", department: CONFIG.DEPARTMENTS[0], hidden: false, created_at: new Date().toISOString() };
  const u1 = { id: "seed1", email: "seed1@eslsca.edu.eg", alias: "CalmIbis214" };
  const u2 = { id: "seed2", email: "seed2@eslsca.edu.eg", alias: "SwiftNile870" };
  const rv = (p, u, [cname, course], sem, o, c, f, w, h, again, grade, comment, daysAgo) => ({
    id: uid(), professor_id: p.id, user_id: u.id, course_name: cname, course_code: course, course_key: ckey(cname, course), semester: sem,
    overall: o, clarity: c, fairness: f, workload: w, helpfulness: h, would_take_again: again,
    grade, comment, hidden: false,
    created_at: new Date(Date.now() - daysAgo * 864e5).toISOString(),
    updated_at: new Date(Date.now() - daysAgo * 864e5).toISOString(),
  });
  return {
    users: [u1, u2],
    professors: [p1, p2, p3],
    reviews: [
      rv(p1, u1, ["Contemporary Management", "BUS101"], "Fall 2025", 5, 5, 4, 3, 5, true, "A-", "Explains every concept with real Egyptian business examples. Quizzes are fair if you attend.", 40),
      rv(p1, u2, ["Principles of Marketing", "BUS205"], "Spring 2026", 4, 4, 4, 4, 4, true, "B+", "Heavy reading load but office hours really help. Slides are posted after every lecture.", 12),
      rv(p2, u1, ["Introduction to Programming", "CS110"], "Spring 2026", 3, 2, 4, 4, 4, false, "B", "Knows the material very well but goes fast. Labs are useful, start the project early.", 20),
      rv(p3, u2, ["Accounting", null], "Fall 2025", 4, 4, 3, 2, 5, true, null, "شرح ممتاز والامتحان في مستوى المحاضرات. Very approachable.", 60),
    ],
    reports: [],
    session: null,
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return s;
  } catch {}
  const s = seed();
  save(s);
  return s;
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
let db = load();
let listeners = [];
let pendingEmail = null;

const me = () => db.users.find((u) => u.email === db.session);
const needUser = () => {
  const u = me();
  if (!u) throw new Error("Please sign in first");
  return u;
};
const allowed = (email) => {
  const d = (email.split("@")[1] || "").toLowerCase();
  return CONFIG.ALLOWED_DOMAINS.some((a) => d === a || d.endsWith("." + a));
};
function stats(p) {
  const rs = db.reviews.filter((r) => r.professor_id === p.id && !r.hidden);
  return {
    id: p.id, name: p.name, department: p.department, created_at: p.created_at,
    review_count: rs.length,
    avg_overall: avg(rs.map((r) => r.overall)),
    avg_clarity: avg(rs.map((r) => r.clarity)),
    avg_fairness: avg(rs.map((r) => r.fairness)),
    avg_workload: avg(rs.map((r) => r.workload)),
    avg_helpfulness: avg(rs.map((r) => r.helpfulness)),
    take_again_pct: rs.length ? Math.round((100 * rs.filter((r) => r.would_take_again).length) / rs.length) : null,
    courses: [...new Set(rs.map((r) => r.course_code).filter(Boolean))],
    course_names: [...new Set(rs.map((r) => r.course_name).filter(Boolean))],
  };
}

export const api = {
  demo: true,
  async getSession() {
    return db.session ? { email: db.session } : null;
  },
  onAuthChange(cb) {
    listeners.push(cb);
  },
  async isEmailAllowed(email) {
    return allowed(email);
  },
  async sendCode(email) {
    await wait();
    if (!allowed(email)) throw new Error("Only ESLSCA university email addresses can sign up.");
    pendingEmail = email.toLowerCase();
  },
  async verifyCode(email, token) {
    await wait();
    if (token !== "123456" || pendingEmail !== email.toLowerCase())
      throw new Error("That code is wrong or has expired. Request a new one. (Demo code: 123456)");
    if (!db.users.find((u) => u.email === pendingEmail)) {
      let alias;
      do alias = pick(ADJ) + pick(NOUN) + (100 + Math.floor(Math.random() * 900));
      while (db.users.some((u) => u.alias === alias));
      db.users.push({ id: uid(), email: pendingEmail, alias, created_at: new Date().toISOString() });
    }
    db.session = pendingEmail;
    save(db);
    listeners.forEach((l) => l({ email: db.session }));
  },
  async signOut() {
    db.session = null;
    save(db);
    listeners.forEach((l) => l(null));
  },
  async getMyProfile() {
    const u = needUser();
    return { alias: u.alias, joined: u.created_at };
  },
  async listProfessors() {
    await wait(60);
    return db.professors.filter((p) => !p.hidden).map(stats).sort((a, b) => a.name.localeCompare(b.name));
  },
  async getProfessor(id) {
    const p = db.professors.find((x) => x.id === id && !x.hidden);
    return p ? stats(p) : null;
  },
  async listReviews(professorId) {
    const u = me() || {};
    return db.reviews
      .filter((r) => r.professor_id === professorId && !r.hidden)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({
        ...r,
        alias: db.users.find((x) => x.id === r.user_id)?.alias || "Student",
        is_mine: r.user_id === u.id,
        reported_by_me: db.reports.some((x) => x.review_id === r.id && x.reporter_id === u.id),
        user_id: undefined,
      }));
  },
  async listCourses() {
    const m = new Map();
    for (const r of db.reviews) if (!r.hidden && r.course_name) {
      const e = m.get(r.course_name) || { course_name: r.course_name, course_code: r.course_code, uses: 0 };
      e.uses++; e.course_code = e.course_code || r.course_code; m.set(r.course_name, e);
    }
    return [...m.values()].sort((a, b) => b.uses - a.uses);
  },
  async myReviews() {
    const u = needUser();
    return db.reviews
      .filter((r) => r.user_id === u.id)
      .map((r) => ({ ...r, professor_name: db.professors.find((p) => p.id === r.professor_id)?.name }));
  },
  async createProfessor(name, department) {
    await wait();
    const u = needUser();
    name = name.replace(/\s+/g, " ").trim();
    if (name.length < 3 || name.length > 80) throw new Error("Professor name must be 3–80 characters");
    if (!department) throw new Error("Please choose a department");
    if (hasBanned(name) || hasBanned(department)) throw new Error("Please keep it respectful — that text contains a blocked word");
    const k = nameKey(name);
    if (k.length < 3) throw new Error("Please enter the professor's full name");
    const ex = db.professors.find((p) => nameKey(p.name) === k);
    if (ex) {
      if (ex.hidden) throw new Error("This professor profile was removed after reports");
      return { id: ex.id, existed: true };
    }
    const p = { id: uid(), name, department, created_by: u.id, hidden: false, created_at: new Date().toISOString() };
    db.professors.push(p);
    save(db);
    return { id: p.id, existed: false };
  },
  async upsertReview(r) {
    await wait();
    const u = needUser();
    let cname = (r.course_name || "").trim().replace(/\s+/g, " ");
    if (cname.length < 2 || cname.length > 80) throw new Error("Please enter the course name, like Contemporary Management");
    if (hasBanned(cname)) throw new Error("Please keep it respectful — the course name contains a blocked word");
    cname = db.reviews.find((x) => x.course_name && x.course_name.toLowerCase() === cname.toLowerCase())?.course_name || cname;
    const code = (r.course_code || "").toUpperCase().replace(/[\s\-_./]+/g, "") || null;
    if (code && !/^[A-Z0-9]{2,12}$/.test(code)) throw new Error("Course code should look like BUS101 (letters and numbers only), or leave it empty");
    const key = ckey(cname, code);
    if (!/^(Fall|Spring|Summer) 20\d\d$/.test(r.semester || "")) throw new Error("Please choose a semester");
    for (const k of ["overall", "clarity", "fairness", "workload", "helpfulness"])
      if (!(r[k] >= 1 && r[k] <= 5)) throw new Error("Please give every rating from 1 to 5");
    const comment = (r.comment || "").trim();
    if (comment.length < 10 || comment.length > 1500) throw new Error("Comment must be 10–1500 characters");
    if (hasBanned(comment)) throw new Error("Please keep it respectful — your comment contains a blocked word");
    const fields = {
      course_name: cname, course_code: code, course_key: key,
      semester: r.semester, overall: r.overall, clarity: r.clarity, fairness: r.fairness, workload: r.workload,
      helpfulness: r.helpfulness, would_take_again: !!r.would_take_again, grade: r.grade || null, comment,
    };
    const ex = db.reviews.find((x) => x.user_id === u.id && x.professor_id === r.professor_id && x.course_key === key);
    if (ex) Object.assign(ex, fields, { updated_at: new Date().toISOString() });
    else {
      const now = new Date().toISOString();
      db.reviews.push({ id: uid(), professor_id: r.professor_id, user_id: u.id, hidden: false, created_at: now, updated_at: now, ...fields });
    }
    save(db);
  },
  async deleteReview(id) {
    const u = needUser();
    db.reviews = db.reviews.filter((r) => !(r.id === id && r.user_id === u.id));
    save(db);
  },
  async report({ reviewId = null, professorId = null, reason, details = "" }) {
    const u = needUser();
    let hidden = false;
    if (reviewId) {
      const r = db.reviews.find((x) => x.id === reviewId);
      if (r?.user_id === u.id) throw new Error("You can't report your own review");
      if (!db.reports.some((x) => x.review_id === reviewId && x.reporter_id === u.id))
        db.reports.push({ reporter_id: u.id, review_id: reviewId, reason, details });
      if (db.reports.filter((x) => x.review_id === reviewId).length >= 3) { r.hidden = true; hidden = true; }
    } else {
      const p = db.professors.find((x) => x.id === professorId);
      if (!db.reports.some((x) => x.professor_id === professorId && x.reporter_id === u.id))
        db.reports.push({ reporter_id: u.id, professor_id: professorId, reason, details });
      if (db.reports.filter((x) => x.professor_id === professorId).length >= 5) { p.hidden = true; hidden = true; }
    }
    save(db);
    return { hidden };
  },
  resetDemo() {
    db = seed();
    save(db);
  },
};
