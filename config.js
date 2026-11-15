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

  // "Buy me a coffee" pop-up. Leave INSTAPAY_LINK empty to turn it off.
  INSTAPAY_LINK: "https://ipn.eg/S/lailaelsaeed/instapay/6krG3F",
  INSTAPAY_HANDLE: "lailaelsaeed@instapay",
  // The pop-up opens on a professor's page (including right after posting a review),
  // at most once every this many days per person. The footer link always works.
  COFFEE_EVERY_DAYS: 7,

  DEPARTMENTS: [
    "Business Administration",
    "Computing and Digital Technology",
    "Graduate School / MBA",
    "General Education / Languages",
  ],
};
