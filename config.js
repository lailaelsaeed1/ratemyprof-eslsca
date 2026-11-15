// =============================================================
//  Site settings — the only file you need to edit before deploying
// =============================================================
export const CONFIG = {
  // From Supabase → Project Settings → API (or "Connect" button).
  // Leave both empty to run the site in DEMO MODE (data saved only in your browser).
  SUPABASE_URL: "https://pohyzeeomxvqstzxntie.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_RFeVHwyslv-bDnY2yfbA4g_iLmhWFSN",

  SITE_NAME: "RateMyProf ESLSCA",

  // false = only signed-in students can read reviews.
  // If you set true, also run the "grant ... to anon" line in schema.sql.
  PUBLIC_READ: false,

  // Shown on the login page. The real check happens in the database
  // (table allowed_email_domains), so keep the two in sync.
  ALLOWED_DOMAINS: ["eslsca.edu.eg"],

  DEPARTMENTS: [
    "Business Administration",
    "Computing and Digital Technology",
    "Graduate School / MBA",
    "General Education / Languages",
  ],
};
