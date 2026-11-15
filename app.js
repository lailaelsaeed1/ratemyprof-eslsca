import { CONFIG } from "./config.js";

const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
// Accept URLs copied with a path on the end, like https://xyz.supabase.co/rest/v1/
if (!DEMO) CONFIG.SUPABASE_URL = String(CONFIG.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
if (!DEMO) checkConfig();
const { api } = await (DEMO ? import("./api-demo.js") : import("./api-supabase.js")).catch((e) => {
  throw new Error(`Couldn't load the database connection (${e.message}). Check your internet connection and reload.`);
});

function checkConfig() {
  const url = String(CONFIG.SUPABASE_URL).trim();
  const key = String(CONFIG.SUPABASE_ANON_KEY).trim();
  if (!/^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(url))
    throw new Error(`SUPABASE_URL in config.js should look like https://abcdefgh.supabase.co, with nothing after ".co". It is currently: ${url}`);
  if (/^sb_secret_/.test(key) || /service_role/.test(key))
    throw new Error("SUPABASE_ANON_KEY in config.js is your SECRET key. Use the publishable key (sb_publishable_…) or the anon public key, and reset the secret key in Supabase.");
  if (!/^(sb_publishable_|eyJ)/.test(key))
    throw new Error("SUPABASE_ANON_KEY in config.js doesn't look right. It should start with sb_publishable_ or eyJ.");
}

const $app = document.getElementById("app");
const $nav = document.getElementById("nav");
let session = await api.getSession();
let profile = null;
let profCache = null; // list of professors for search + duplicate hints

document.getElementById("brand-name").textContent = CONFIG.SITE_NAME;
document.title = CONFIG.SITE_NAME;

if (DEMO) {
  const b = document.getElementById("demo-banner");
  b.hidden = false;
  b.innerHTML = `<b>Demo mode.</b> Data stays in this browser. Sign in with any @${esc(CONFIG.ALLOWED_DOMAINS[0])} email and code <b>123456</b>. <button id="reset-demo">Reset demo data</button>`;
  b.querySelector("#reset-demo").onclick = () => { api.resetDemo(); location.hash = "#/"; location.reload(); };
}

// ---------------------------------------------------------------- helpers
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 3200);
}
function fmt(v) {
  return v == null ? "–" : Number(v).toFixed(1);
}
function dateStr(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Hand-drawn red-pen loops. Each id gets a slightly different loop and tilt,
// so a page of grades looks marked by hand rather than stamped.
const LOOPS = [
  "M10 28C6 12 28 3 46 5s20 15 14 28S24 47 12 38C7 34 6 30 9 24",
  "M8 22C10 8 34 2 50 7s16 22 6 31-36 10-44-1C6 31 5 25 12 17",
  "M12 34C4 22 16 6 36 4s28 9 26 22-20 20-38 18C18 46 10 40 14 30",
];
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function mark(value, { size = "", seed = "", draw = false, emptyText = "No grades yet" } = {}) {
  const h = hash(seed);
  const tilt = (h % 9) - 4;
  if (value == null) {
    return `<span class="mark empty ${size}" aria-label="${esc(emptyText)}"><svg viewBox="0 0 64 48" aria-hidden="true"><path d="${LOOPS[0]}"/></svg><b>${esc(emptyText)}</b></span>`;
  }
  const label = Number(value) % 1 === 0 && size === "sm" ? String(value) : fmt(value);
  return `<span class="mark ${size} ${draw ? "draw" : ""}" style="transform:rotate(${tilt}deg)" aria-label="${fmt(value)} out of 5">
    <svg viewBox="0 0 64 48" aria-hidden="true"><path d="${LOOPS[h % LOOPS.length]}"/></svg><b>${label}</b></span>`;
}

function semesters() {
  const y = new Date().getFullYear();
  const out = [];
  for (let yr = y + 1; yr >= y - 6; yr--) for (const s of ["Fall", "Summer", "Spring"]) out.push(`${s} ${yr}`);
  return out;
}
const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F", "Pass", "Withdrawn", "In progress"];
const REASONS = { abusive: "Abusive or a personal attack", spam: "Spam or off-topic", fake: "Not a real professor", duplicate: "Duplicate profile", other: "Something else" };
const courseKey = (name, code) => (name || "").trim() ? name.trim().replace(/\s+/g, " ").toLowerCase() : (code || "").toLowerCase();
const courseLabel = (r) => r.course_name || r.course_code || "";
const norm = (s) => s.toLowerCase().replace(/^((prof|professor|dr|doctor|eng|mr|mrs|ms|د|دكتور|دكتورة)\.?\s+)+/u, "").replace(/[\s\p{P}]+/gu, "");

async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "One moment…";
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}
function showError(el, err) {
  el.innerHTML = `<div class="error" role="alert">${esc(err.message || err)}</div>`;
}
async function loadProfessors(force = false) {
  if (!profCache || force) profCache = await api.listProfessors();
  return profCache;
}
function modal(html, onMount) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="sheet modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.querySelector(".modal-bg").addEventListener("click", (e) => { if (e.target.classList.contains("modal-bg")) close(); });
  onMount?.(root.querySelector(".modal"), close);
  root.querySelector(".modal button, .modal select, .modal input")?.focus();
  return close;
}

// ---------------------------------------------------------------- buy me a coffee
const COFFEE_KEY = "rmp-coffee-seen";
function coffeeModal() {
  if (!CONFIG.INSTAPAY_LINK) return;
  try { localStorage.setItem(COFFEE_KEY, String(Date.now())); } catch {}
  modal(`
    <button class="modal-x" type="button" aria-label="Close">&times;</button>
    <span class="coffee-mark" aria-hidden="true">
      <svg viewBox="0 0 64 48"><path d="${LOOPS[0]}"/></svg>
      <svg class="cup" viewBox="0 0 24 24"><path d="M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1"/><path d="M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"/><path d="M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"/><path d="M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5z"/><path d="M16.746 16.726a3 3 0 1 0 .252 -5.555"/></svg>
    </span>
    <h2 class="coffee-title">Buy me a coffee</h2>
    <p class="muted" style="margin-bottom:22px">RateMyProf is free, has no ads, and is run by one ESLSCA student. If you find this helpful, a small tip keeps the database and emails running.</p>
    <a class="btn btn-primary" style="width:100%" href="${esc(CONFIG.INSTAPAY_LINK)}" target="_blank" rel="noopener">Send with InstaPay</a>
    ${CONFIG.INSTAPAY_HANDLE ? `<div class="handle">
      <div><span class="small muted">Or send to</span><br><b>${esc(CONFIG.INSTAPAY_HANDLE)}</b></div>
      <button class="btn-text copy" type="button">Copy</button></div>` : ""}
    <div class="coffee-foot"><span class="small muted">Payments go through InstaPay. Any amount helps.</span>
      <button class="btn-text later" type="button">Maybe later</button></div>`,
    (m, close) => {
      m.classList.add("coffee");
      m.querySelector(".modal-x").onclick = close;
      m.querySelector(".later").onclick = close;
      const copy = m.querySelector(".copy");
      if (copy) copy.onclick = async () => {
        try { await navigator.clipboard.writeText(CONFIG.INSTAPAY_HANDLE); copy.textContent = "Copied"; }
        catch { copy.textContent = "Copy failed"; }
        setTimeout(() => (copy.textContent = "Copy"), 1600);
      };
    });
}
// Shown on a professor's page, at most once every COFFEE_EVERY_DAYS days.
function maybeCoffee() {
  if (!CONFIG.INSTAPAY_LINK) return;
  let last = 0;
  try { last = Number(localStorage.getItem(COFFEE_KEY)) || 0; } catch {}
  const days = Number(CONFIG.COFFEE_EVERY_DAYS ?? 7);
  if (Date.now() - last < days * 864e5) return;
  const here = location.hash;
  // Give them a moment to see the page first, and skip it if they've already moved on.
  setTimeout(() => {
    if (location.hash === here && !document.querySelector("#modal-root .modal")) coffeeModal();
  }, 1200);
}
if (CONFIG.INSTAPAY_LINK) {
  const link = document.getElementById("coffee-link");
  link.hidden = false;
  link.onclick = coffeeModal;
}

// ---------------------------------------------------------------- nav + router
function renderNav() {
  if (!session) {
    $nav.innerHTML = `<a href="#/login" class="cta">Sign in</a>`;
    return;
  }
  $nav.innerHTML = `
    <a href="#/" class="hide-sm">Professors</a>
    <a href="#/add">Add<span class="hide-sm"> a professor</span></a>
    <a href="#/me" class="alias" title="Your public alias">${esc(profile?.alias || "Me")}</a>`;
}

// (setTimeout: supabase-js advises against awaiting other calls inside this callback)
api.onAuthChange((s) => setTimeout(async () => {
  const changed = !!s !== !!session;
  session = s;
  if (!changed) return;
  profile = s ? await api.getMyProfile().catch(() => null) : null;
  profCache = null;
  renderNav();
  if (location.hash !== "#/login") route();
}, 0));

const routes = [
  [/^#\/login$/, viewLogin, false],
  [/^#\/guidelines$/, viewGuidelines, false],
  [/^#\/add$/, viewAdd, true],
  [/^#\/me$/, viewMe, true],
  [/^#\/p\/([\w-]+)\/rate$/, viewRate, true],
  [/^#\/p\/([\w-]+)$/, viewProfessor, !CONFIG.PUBLIC_READ],
  [/^#\/?$/, viewHome, !CONFIG.PUBLIC_READ],
];

async function route() {
  window.__appStarted = true;
  const hash = location.hash.split("?")[0] || "#/";
  window.scrollTo(0, 0);
  document.getElementById("modal-root").innerHTML = "";
  for (const [re, view, needsAuth] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (needsAuth && !session) {
      sessionStorage.setItem("after-login", location.hash || "#/");
      location.hash = "#/login";
      return;
    }
    try {
      await view(...m.slice(1));
    } catch (e) {
      $app.innerHTML = `<div class="sheet sheet-pad form-sheet"><h2>This page didn't load</h2><p class="muted" style="margin:8px 0 14px">${esc(e.message)}</p><a href="#/">Go to all professors</a></div>`;
    }
    return;
  }
  $app.innerHTML = `<div class="sheet empty form-sheet"><h2>There's no page here</h2><p class="muted">The link may be broken.</p><a class="btn btn-primary" href="#/">Go to all professors</a></div>`;
}
window.addEventListener("hashchange", route);

// ---------------------------------------------------------------- views
function viewLogin() {
  if (session) { location.hash = "#/"; return; }
  const domains = CONFIG.ALLOWED_DOMAINS.map((d) => "@" + d).join(" or ");
  $app.innerHTML = `
    <div class="sheet sheet-pad form-sheet" style="max-width:520px">
      <h1>Sign in</h1>
      <p class="lede" style="margin-top:10px">Use your ESLSCA email (${esc(domains)}). We'll send you a one-time code, so there's no password to remember.</p>
      <p class="note">You'll get a random alias, like <b>QuietFalcon482</b>. Other students only ever see the alias, never your name or email.</p>
      <form id="f-email" style="margin-top:22px">
        <div class="field"><label for="email">University email</label>
          <input id="email" type="email" required autocomplete="email" placeholder="you${esc(domains.split(" ")[0])}" /></div>
        <div id="err"></div>
        <button class="btn btn-primary" type="submit">Email me a code</button>
      </form>
      <form id="f-code" hidden style="margin-top:22px">
        <p style="margin-bottom:16px">We sent an email to <b id="sent-to"></b>. Type the code from it below, or click the sign-in link in it if there's one. It can take a minute to arrive, so check your Junk folder too.</p>
        <div class="field"><label for="code">Code from the email</label>
          <input id="code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]{6,10}" required /></div>
        <div id="err2"></div>
        <div class="actions"><button class="btn btn-primary" type="submit">Sign in</button>
          <button class="btn-text" type="button" id="back">Use a different email</button></div>
      </form>
    </div>`;
  const fEmail = $app.querySelector("#f-email");
  const fCode = $app.querySelector("#f-code");
  let email = "";
  fEmail.onsubmit = async (e) => {
    e.preventDefault();
    email = fEmail.email.value.trim().toLowerCase();
    const err = $app.querySelector("#err");
    err.innerHTML = "";
    await busy(fEmail.querySelector("button"), async () => {
      try {
        if (!(await api.isEmailAllowed(email))) throw new Error(`Only ESLSCA emails can sign in. Use your ${domains} address.`);
        await api.sendCode(email);
        fEmail.hidden = true;
        fCode.hidden = false;
        $app.querySelector("#sent-to").textContent = email;
        fCode.code.focus();
      } catch (ex) { showError(err, ex); }
    });
  };
  fCode.onsubmit = async (e) => {
    e.preventDefault();
    const err = $app.querySelector("#err2");
    err.innerHTML = "";
    await busy(fCode.querySelector("button"), async () => {
      try {
        await api.verifyCode(email, fCode.code.value.replace(/\D/g, ""));
        session = await api.getSession();
        profile = await api.getMyProfile();
        renderNav();
        toast(`Signed in. You'll post as ${profile.alias}`);
        const next = sessionStorage.getItem("after-login") || "#/";
        sessionStorage.removeItem("after-login");
        location.hash = next === "#/login" ? "#/" : next;
        if (location.hash === next) route();
      } catch (ex) { showError(err, ex); }
    });
  };
  $app.querySelector("#back").onclick = () => { fCode.hidden = true; fEmail.hidden = false; };
}

async function viewHome() {
  $app.innerHTML = `<p class="muted">Loading professors…</p>`;
  const profs = await loadProfessors(true);
  const depts = [...new Set([...CONFIG.DEPARTMENTS, ...profs.map((p) => p.department)])];
  const totalReviews = profs.reduce((a, p) => a + p.review_count, 0);
  $app.innerHTML = `
    <section class="hero">
      <h1>Grade your professors.</h1>
      <p>Anonymous reviews from ESLSCA students, so you know what a course is really like before you register. Search by professor, course name or course code.</p>
    </section>
    <div class="search" role="search">
      <input type="search" id="q" placeholder="Professor or course, like Accounting" aria-label="Search professors" />
      <select id="dept" aria-label="Department"><option value="">All departments</option>${depts.map((d) => `<option>${esc(d)}</option>`).join("")}</select>
      <select id="sort" aria-label="Sort by">
        <option value="reviews">Most reviewed</option><option value="best">Highest grade</option>
        <option value="new">Recently added</option><option value="az">Name, A to Z</option></select>
    </div>
    <p class="count" id="count"></p>
    <div id="list"></div>`;
  const q = $app.querySelector("#q"), dept = $app.querySelector("#dept"), sort = $app.querySelector("#sort");
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const termN = norm(term);
    let rows = profs.filter((p) =>
      (!dept.value || p.department === dept.value) &&
      (!term || norm(p.name).includes(termN) || p.name.toLowerCase().includes(term) ||
        (p.courses || []).some((c) => c.toLowerCase().includes(term.replace(/[\s-]/g, ""))) ||
        (p.course_names || []).some((c) => c.toLowerCase().includes(term))));
    const s = sort.value;
    rows.sort((a, b) =>
      s === "best" ? (b.avg_overall ?? -1) - (a.avg_overall ?? -1) || b.review_count - a.review_count
      : s === "new" ? b.created_at.localeCompare(a.created_at)
      : s === "az" ? a.name.localeCompare(b.name)
      : b.review_count - a.review_count || a.name.localeCompare(b.name));
    $app.querySelector("#count").textContent = term || dept.value
      ? `${plural(rows.length, "professor")} found`
      : `${plural(profs.length, "professor")}, ${plural(totalReviews, "review")}`;
    const list = $app.querySelector("#list");
    if (!rows.length) {
      list.innerHTML = `<div class="sheet empty"><h2>No professor matches that</h2>
        <p class="muted">If they teach at ESLSCA and aren't listed yet, you can add them.</p>
        <a class="btn btn-primary" href="#/add${term ? "?name=" + encodeURIComponent(q.value.trim()) : ""}">Add a professor</a></div>`;
      return;
    }
    list.innerHTML = `<div class="sheet ruled">${rows.map(profLine).join("")}</div>
      <p class="after-list">Can't find someone? <a href="#/add">Add a professor</a>.</p>`;
  };
  q.oninput = dept.onchange = sort.onchange = draw;
  draw();
  q.focus();
}

function courseChips(p) {
  const list = (p.course_names || []).length ? p.course_names : p.courses || [];
  if (!list.length) return "";
  const more = list.length > 4 ? `<span class="chip">+${list.length - 4} more</span>` : "";
  return `<span class="chips">${list.slice(0, 4).map((c) => `<span class="chip">${esc(c)}</span>`).join("")}${more}</span>`;
}

function profLine(p) {
  return `<a class="line prof-line" href="#/p/${esc(p.id)}">
    <span class="gut">${mark(p.avg_overall, { seed: p.id, emptyText: "New" })}</span>
    <span class="body">
      <span>
        <span class="name" dir="auto">${esc(p.name)}</span><br>
        <span class="dept">${esc(p.department)}</span>
        ${courseChips(p)}
      </span>
      <span class="figures">
        ${p.review_count ? `<b>${p.review_count}</b> ${p.review_count === 1 ? "review" : "reviews"}<br>` : "No reviews yet<br>"}
        ${p.take_again_pct != null ? `<b>${p.take_again_pct}%</b> would take again` : ""}
      </span>
    </span></a>`;
}

async function viewAdd() {
  const pre = new URLSearchParams(location.hash.split("?")[1] || "").get("name") || "";
  const profs = await loadProfessors();
  $app.innerHTML = `
    <div class="sheet sheet-pad form-sheet">
      <h1>Add a professor</h1>
      <p class="lede">Search first. If they're already listed, go to their page and rate them there.</p>
      <form id="f">
        <div class="field"><label for="name">Full name <span class="hint">as students know them, like "Dr. Ahmed Hassan"</span></label>
          <input id="name" type="text" required minlength="3" maxlength="80" dir="auto" value="${esc(pre)}" autocomplete="off" />
          <div id="similar" class="suggest"></div></div>
        <div class="field"><label for="dept">Department</label>
          <select id="dept" required><option value="">Choose a department</option>
            ${CONFIG.DEPARTMENTS.map((d) => `<option>${esc(d)}</option>`).join("")}<option value="__other">Another department</option></select>
          <input id="dept-other" type="text" maxlength="80" placeholder="Department name" hidden style="margin-top:8px" /></div>
        <div id="err"></div>
        <div class="actions"><button class="btn btn-primary" type="submit">Add professor</button><a class="btn btn-ghost" href="#/">Cancel</a></div>
      </form>
      <p class="muted small" style="margin-top:20px">Only add real ESLSCA teaching staff. Fake and duplicate profiles get reported and removed.</p>
    </div>`;
  const f = $app.querySelector("#f");
  const other = $app.querySelector("#dept-other");
  f.dept.onchange = () => { other.hidden = f.dept.value !== "__other"; other.required = !other.hidden; };
  const similar = $app.querySelector("#similar");
  const check = () => {
    const n = norm(f.name.value);
    if (n.length < 3) { similar.innerHTML = ""; return; }
    const hits = profs.filter((p) => { const k = norm(p.name); return k.includes(n) || n.includes(k); }).slice(0, 4);
    similar.innerHTML = hits.length
      ? `<div class="hint">Already listed? Pick them instead:</div>` + hits.map((p) => `<a href="#/p/${esc(p.id)}" dir="auto">${esc(p.name)}<span>${esc(p.department)}</span></a>`).join("")
      : "";
  };
  f.name.oninput = check;
  check();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $app.querySelector("#err");
    err.innerHTML = "";
    const dept = f.dept.value === "__other" ? other.value.trim() : f.dept.value;
    await busy(f.querySelector("button"), async () => {
      try {
        const res = await api.createProfessor(f.name.value, dept);
        profCache = null;
        toast(res.existed ? "They're already listed, so we opened their page" : "Professor added. Write the first review");
        location.hash = res.existed ? `#/p/${res.id}` : `#/p/${res.id}/rate`;
      } catch (ex) { showError(err, ex); }
    });
  };
}

async function viewProfessor(id) {
  $app.innerHTML = `<p class="muted">Loading…</p>`;
  const [p, reviews] = await Promise.all([api.getProfessor(id), api.listReviews(id)]);
  if (!p) {
    $app.innerHTML = `<div class="sheet empty form-sheet"><h2>Professor not found</h2><p class="muted">This profile may have been removed after reports.</p><a class="btn btn-primary" href="#/">Go to all professors</a></div>`;
    return;
  }
  const courseFilter = new Map();
  for (const r of reviews) {
    const k = r.course_key || courseKey(r.course_name, r.course_code);
    if (!courseFilter.has(k) || r.course_name) courseFilter.set(k, courseLabel(r));
  }
  const meter = (label, v, lo = "", hi = "") =>
    `<div class="meter"><div class="label"><span>${label}</span><b>${fmt(v)}</b></div>
      <div class="track"><div class="fill" style="width:${v == null ? 0 : (v / 5) * 100}%"></div></div>
      ${lo ? `<div class="scale"><span>${lo}</span><span>${hi}</span></div>` : ""}</div>`;
  $app.innerHTML = `
    <a href="#/" class="crumb">All professors</a>
    <section class="sheet">
      <div class="prof-top">
        <div>${mark(p.avg_overall, { size: "lg", seed: p.id, draw: true, emptyText: "No grades yet" })}</div>
        <div>
          <h1 dir="auto">${esc(p.name)}</h1>
          <p class="dept">${esc(p.department)}</p>
          <div class="facts">
            <div><b>${p.review_count}</b>${p.review_count === 1 ? "review" : "reviews"}</div>
            <div><b>${p.take_again_pct == null ? "–" : p.take_again_pct + "%"}</b>would take again</div>
          </div>
          <div class="actions">
            <a class="btn btn-primary" href="#/p/${esc(p.id)}/rate">Rate this professor</a>
            <button class="btn-text" id="report-prof">Report this profile</button>
          </div>
        </div>
      </div>
      <div class="breakdown">
        ${meter("Teaching clarity", p.avg_clarity)}
        ${meter("Grading fairness", p.avg_fairness)}
        ${meter("Helpfulness", p.avg_helpfulness)}
        ${meter("Workload", p.avg_workload, "Light", "Heavy")}
      </div>
    </section>
    <div class="section-head"><h2>What students say</h2></div>
    ${courseFilter.size > 1 ? `<div class="filters" id="course-filter"><button class="chip on" data-c="">All courses</button>${[...courseFilter].map(([k, label]) => `<button class="chip" data-c="${esc(k)}">${esc(label)}</button>`).join("")}</div>` : ""}
    <div id="reviews"></div>`;

  const box = $app.querySelector("#reviews");
  const draw = (course = "") => {
    const rows = reviews.filter((r) => !course || (r.course_key || courseKey(r.course_name, r.course_code)) === course);
    box.innerHTML = rows.length
      ? `<div class="sheet ruled">${rows.map(reviewLine).join("")}</div>`
      : `<div class="sheet empty"><h2>No reviews yet</h2><p class="muted">Took a course with them? Your review helps the next student.</p><a class="btn btn-primary" href="#/p/${esc(p.id)}/rate">Write the first review</a></div>`;
  };
  draw();
  $app.querySelector("#course-filter")?.addEventListener("click", (e) => {
    const b = e.target.closest("button.chip");
    if (!b) return;
    $app.querySelectorAll("#course-filter .chip").forEach((x) => x.classList.toggle("on", x === b));
    draw(b.dataset.c);
  });

  box.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const r = reviews.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === "edit") location.hash = `#/p/${p.id}/rate?course=${encodeURIComponent(r.course_key || courseKey(r.course_name, r.course_code))}`;
    if (b.dataset.act === "delete") {
      modal(`<h2>Delete your review?</h2><p class="muted" style="margin-bottom:20px">Your ${esc(courseLabel(r))} review will be removed for good.</p>
        <div class="actions"><button class="btn btn-danger" id="yes">Delete review</button><button class="btn btn-ghost" id="no">Keep it</button></div>`,
        (m, close) => {
          m.querySelector("#no").onclick = close;
          m.querySelector("#yes").onclick = async () => { await api.deleteReview(r.id); close(); toast("Review deleted"); route(); };
        });
    }
    if (b.dataset.act === "report") reportModal({ reviewId: r.id }, "review");
  });
  $app.querySelector("#report-prof").onclick = () => reportModal({ professorId: p.id }, "profile");
  maybeCoffee();
}

function reviewLine(r) {
  const edited = r.updated_at && r.updated_at.slice(0, 16) !== r.created_at.slice(0, 16);
  return `<article class="line review ${r.is_mine ? "mine" : ""}">
    <div class="gut">${mark(r.overall, { size: "sm", seed: r.id })}</div>
    <div class="body">
      <div class="head"><div class="who"><span class="alias">${esc(r.alias)}</span>${r.is_mine ? `<span class="you">You</span>` : ""}</div>
        <div class="tools">${r.is_mine
        ? `<button class="btn-text" data-act="edit" data-id="${esc(r.id)}">Edit</button><button class="btn-text" data-act="delete" data-id="${esc(r.id)}">Delete</button>`
        : r.reported_by_me ? `<span class="small muted">You reported this</span>`
        : `<button class="btn-text" data-act="report" data-id="${esc(r.id)}">Report</button>`}</div></div>
      <div class="meta">
        <span><b>${esc(courseLabel(r))}</b></span>${r.course_name && r.course_code ? `<span>${esc(r.course_code)}</span>` : ""}<span>${esc(r.semester)}</span>
        ${r.grade ? `<span>Got <b>${esc(r.grade)}</b></span>` : ""}
        <span>${dateStr(r.created_at)}${edited ? ", edited" : ""}</span>
      </div>
      <p class="comment" dir="auto">${esc(r.comment)}</p>
      <div class="subs">
        <span>Clarity <b>${r.clarity}</b></span><span>Fairness <b>${r.fairness}</b></span>
        <span>Helpfulness <b>${r.helpfulness}</b></span><span>Workload <b>${r.workload}</b></span>
        <span class="${r.would_take_again ? "again-yes" : "again-no"}">${r.would_take_again ? "Would take again" : "Wouldn't take again"}</span>
      </div>
    </div></article>`;
}

function reportModal(target, what) {
  modal(`<h2>Report this ${what}</h2>
    <form id="rf" style="margin-top:14px">
      <div class="field"><label for="reason">What's wrong?</label><select id="reason" required>
        ${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label for="details">Details <span class="hint">optional</span></label>
        <textarea id="details" maxlength="300" style="min-height:80px"></textarea></div>
      <p class="muted small" style="margin-bottom:16px">Reports are anonymous. After several students report the same thing, it's hidden automatically.</p>
      <div id="rerr"></div>
      <div class="actions"><button class="btn btn-primary" type="submit">Send report</button><button class="btn btn-ghost" type="button" id="cancel">Cancel</button></div>
    </form>`, (m, close) => {
    m.querySelector("#cancel").onclick = close;
    const f = m.querySelector("#rf");
    f.onsubmit = async (e) => {
      e.preventDefault();
      await busy(f.querySelector("button"), async () => {
        try {
          const res = await api.report({ ...target, reason: f.reason.value, details: f.details.value });
          close();
          toast(res.hidden ? "Report sent. This is now hidden" : "Report sent");
          if (res.hidden && target.professorId) location.hash = "#/"; else route();
        } catch (ex) { showError(m.querySelector("#rerr"), ex); }
      });
    };
  });
}

async function viewRate(id) {
  const course = new URLSearchParams(location.hash.split("?")[1] || "").get("course") || "";
  const [p, reviews, catalog] = await Promise.all([api.getProfessor(id), api.listReviews(id), api.listCourses().catch(() => [])]);
  if (!p) { $app.innerHTML = `<div class="sheet empty form-sheet"><h2>Professor not found</h2><a class="btn btn-primary" href="#/">Go to all professors</a></div>`; return; }
  const mine = reviews.filter((r) => r.is_mine);
  const keyOf = (r) => r.course_key || courseKey(r.course_name, r.course_code);
  let existing = mine.find((r) => keyOf(r) === course.toLowerCase()) || null;
  // This professor's courses first, then everything else students have entered.
  const names = [...new Set([...(p.course_names || []), ...catalog.map((c) => c.course_name)])];
  const scoreRow = (key, label, sub) => `
    <div class="score-row"><div class="what">${label}<small>${sub}</small></div>
      <div class="picks" data-key="${key}" role="radiogroup" aria-label="${label}">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" role="radio" aria-checked="false" aria-label="${n} out of 5">${n}</button>`).join("")}</div></div>`;
  $app.innerHTML = `
    <div class="form-sheet"><a href="#/p/${esc(p.id)}" class="crumb" dir="auto">${esc(p.name)}</a></div>
    <div class="sheet sheet-pad form-sheet">
      <h1>Rate <span dir="auto">${esc(p.name)}</span></h1>
      <p class="lede">You're posting as <b>${esc(profile?.alias || "your alias")}</b>. You can write one review per course and edit it later.</p>
      <div id="edit-note"></div>
      <form id="f">
        <div class="two">
          <div class="field"><label for="cname">Course name</label>
            <input id="cname" type="text" required minlength="2" maxlength="80" dir="auto" placeholder="Contemporary Management" value="${esc(existing?.course_name || "")}" list="cname-list" autocomplete="off" />
            <datalist id="cname-list">${names.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
          <div class="field"><label for="course">Course code <span class="hint">optional</span></label>
            <input id="course" type="text" maxlength="15" placeholder="BUS101" value="${esc(existing?.course_code || "")}" list="course-list" autocomplete="off" />
            <datalist id="course-list">${(p.courses || []).map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
        </div>
        <div class="two">
          <div class="field"><label for="semester">Semester</label>
            <select id="semester" required><option value="">Choose a semester</option>${semesters().map((s) => `<option ${existing?.semester === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        </div>
        <span class="label">Your grades for the professor <span class="hint">1 is the lowest, 5 the highest</span></span>
        <div class="scores">
          ${scoreRow("overall", "Overall", "Your overall grade")}
          ${scoreRow("clarity", "Teaching clarity", "Explains things clearly")}
          ${scoreRow("fairness", "Grading fairness", "Exams and grading are fair")}
          ${scoreRow("helpfulness", "Helpfulness", "Available and supportive")}
          ${scoreRow("workload", "Workload", "1 is light, 5 is heavy")}
        </div>
        <div class="two">
          <div class="field"><span class="label">Would you take a course with them again?</span>
            <div class="seg" id="again"><button type="button" data-v="true">Yes</button><button type="button" data-v="false">No</button></div></div>
          <div class="field"><label for="grade">Your grade <span class="hint">optional</span></label>
            <select id="grade"><option value="">Prefer not to say</option>${GRADES.map((g) => `<option ${existing?.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="comment">Your review <span class="hint">about the teaching, not the person</span></label>
          <textarea id="comment" required minlength="10" maxlength="1500" dir="auto" placeholder="How were the lectures and exams? What should the next student know?">${esc(existing?.comment || "")}</textarea>
          <div class="counter"><span id="count">0</span> / 1500</div></div>
        <div id="err"></div>
        <div class="actions"><button class="btn btn-primary" type="submit" id="submit">Post review</button>
          <a class="btn btn-ghost" href="#/p/${esc(p.id)}">Cancel</a></div>
      </form>
    </div>`;

  const f = $app.querySelector("#f");
  const vals = { overall: 0, clarity: 0, fairness: 0, workload: 0, helpfulness: 0, would_take_again: null };
  const paintScores = () =>
    $app.querySelectorAll(".picks").forEach((g) =>
      g.querySelectorAll("button").forEach((b) => {
        const on = +b.dataset.n === vals[g.dataset.key];
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      }));
  const paintAgain = () =>
    $app.querySelectorAll("#again button").forEach((b) => b.classList.toggle("on", String(vals.would_take_again) === b.dataset.v));
  const count = () => ($app.querySelector("#count").textContent = f.comment.value.length);
  const setMode = (r) => {
    existing = r;
    $app.querySelector("#edit-note").innerHTML = r ? `<p class="note" style="margin-bottom:20px">You already reviewed ${esc(courseLabel(r))}, so you're editing that review.</p>` : "";
    $app.querySelector("#submit").textContent = r ? "Save changes" : "Post review";
  };
  const fillFrom = (r) => {
    setMode(r);
    if (r) {
      for (const k of ["overall", "clarity", "fairness", "workload", "helpfulness", "would_take_again"]) vals[k] = r[k];
      f.semester.value = r.semester;
      f.grade.value = r.grade || "";
      f.comment.value = r.comment;
    }
    paintScores(); paintAgain(); count();
  };
  $app.querySelectorAll(".picks").forEach((g) =>
    g.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { vals[g.dataset.key] = +b.dataset.n; paintScores(); }
    }));
  $app.querySelector("#again").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { vals.would_take_again = b.dataset.v === "true"; paintAgain(); }
  });
  f.comment.oninput = count;
  const checkExisting = () => {
    const code = f.course.value.toUpperCase().replace(/[\s\-_./]+/g, "");
    const key = courseKey(f.cname.value, code);
    const match = mine.find((r) => keyOf(r) === key) || (code && mine.find((r) => !r.course_name && r.course_code === code));
    if (match && match !== existing) fillFrom(match);
    else if (!match && existing) setMode(null);
  };
  f.cname.addEventListener("change", () => {
    // Picked a known course: fill in its code if the student left it empty.
    const known = catalog.find((c) => c.course_name.toLowerCase() === f.cname.value.trim().toLowerCase());
    if (known?.course_code && !f.course.value.trim()) f.course.value = known.course_code;
    checkExisting();
  });
  f.course.addEventListener("change", checkExisting);
  fillFrom(existing);

  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $app.querySelector("#err");
    err.innerHTML = "";
    const missing = ["overall", "clarity", "fairness", "helpfulness", "workload"].filter((k) => !vals[k]);
    if (missing.length) return showError(err, "Give a grade from 1 to 5 in every row.");
    if (vals.would_take_again == null) return showError(err, "Choose whether you'd take a course with them again.");
    await busy($app.querySelector("#submit"), async () => {
      try {
        await api.upsertReview({
          professor_id: p.id, course_name: f.cname.value, course_code: f.course.value, semester: f.semester.value,
          overall: vals.overall, clarity: vals.clarity, fairness: vals.fairness, workload: vals.workload,
          helpfulness: vals.helpfulness, would_take_again: vals.would_take_again, grade: f.grade.value, comment: f.comment.value,
        });
        profCache = null;
        toast(existing ? "Changes saved" : "Review posted");
        location.hash = `#/p/${p.id}`;
      } catch (ex) { showError(err, ex); }
    });
  };
}

async function viewMe() {
  profile = await api.getMyProfile();
  const mine = await api.myReviews();
  $app.innerHTML = `
    <div class="sheet sheet-pad form-sheet" style="max-width:720px">
      <h1>${esc(profile.alias)}</h1>
      <p class="lede" style="margin-top:10px">This alias is the only thing other students see. You're signed in as <b>${esc(session.email)}</b>, which only you can see.</p>
      <div class="actions" style="margin-bottom:8px"><button class="btn btn-ghost" id="out">Sign out</button></div>
    </div>
    <div class="section-head"><h2>Your reviews</h2><span class="muted small">${plural(mine.length, "review")}</span></div>
    ${mine.length ? `<div class="sheet ruled">${mine.map((r) => `
      <article class="line review">
        <div class="gut">${mark(r.overall, { size: "sm", seed: r.id })}</div>
        <div class="body">
          <a href="#/p/${esc(r.professor_id)}" dir="auto"><b>${esc(r.professor_name)}</b></a>
          <div class="meta"><span><b>${esc(courseLabel(r))}</b></span>${r.course_name && r.course_code ? `<span>${esc(r.course_code)}</span>` : ""}<span>${esc(r.semester)}</span></div>
          ${r.hidden ? `<p class="hidden-flag">Hidden after reports from other students</p>` : ""}
          <p class="comment" dir="auto">${esc(r.comment)}</p>
          <a class="small" href="#/p/${esc(r.professor_id)}/rate?course=${encodeURIComponent(courseKey(r.course_name, r.course_code))}">Edit this review</a>
        </div></article>`).join("")}</div>`
      : `<div class="sheet empty"><p class="muted">You haven't reviewed anyone yet.</p><a class="btn btn-primary" href="#/">Find a professor</a></div>`}`;
  $app.querySelector("#out").onclick = async () => {
    await api.signOut();
    session = null; profile = null;
    renderNav();
    location.hash = "#/login";
  };
}

function viewGuidelines() {
  $app.innerHTML = `
    <div class="sheet sheet-pad form-sheet">
      <h1>Community guidelines</h1>
      <ol class="guide" style="margin-top:20px">
        <li><b>Grade the teaching, not the person.</b> Talk about lectures, exams, grading, workload and support.</li>
        <li><b>No insults, slurs, threats or harassment</b> in English, Arabic or Franco. Offensive words are blocked automatically.</li>
        <li><b>No private information,</b> like phone numbers, addresses, social accounts or rumours.</li>
        <li><b>Be honest.</b> Only review courses you actually took, one review per professor per course.</li>
        <li><b>Only add real ESLSCA teaching staff.</b> Fake and duplicate profiles get reported and removed.</li>
      </ol>
      <p class="muted" style="margin-top:12px">Use Report on anything that breaks these rules. A review is hidden after 3 reports, a professor profile after 5.</p>
    </div>`;
}

// ---------------------------------------------------------------- start
// Coming back from a sign-in link in the email (instead of typing the code):
// supabase-js has already read the token from the address bar, so just tidy it up.
if (/(^#|&)(access_token|error|error_description)=/.test(location.hash)) {
  const params = new URLSearchParams(location.hash.slice(1));
  const linkError = params.get("error_description");
  history.replaceState(null, "", location.pathname + "#/");
  if (linkError) setTimeout(() => toast(`That sign-in link didn't work: ${linkError}. Request a new code.`), 300);
  else if (session) setTimeout(() => toast("Signed in"), 300);
}
if (session) profile = await api.getMyProfile().catch(() => null);
renderNav();
route();
