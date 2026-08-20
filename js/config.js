/**
 * Bible Explorer — Supabase configuration
 * ----------------------------------------
 * Values below point at the live Supabase project. If you ever spin up
 * a different project (e.g. a staging environment), update these from
 * Supabase Dashboard → Project Settings → API.
 *
 * The publishable/anon key is safe to expose in client-side code — it
 * only grants the permissions defined by Row Level Security policies
 * (see /supabase/schema.sql).
 */
window.BIBLE_EXPLORER_CONFIG = {
  SUPABASE_URL: "https://fmorjnjlwkgfunhcxsll.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ETPzf_uBMXJPfeta1Y92-g_ffiflxVv",

  // Print volumes, in reading order. Each volume covers 90 days of the
  // devotional. Add a new entry here whenever a new volume is published —
  // buy.html renders this list automatically, newest last.
  AMAZON_VOLUMES: [
    { volume: 1, days: "Days 1–90", url: "https://www.amazon.ca/dp/B0F84KSSTN" },
    { volume: 2, days: "Days 91–180", url: "https://www.amazon.ca/dp/B0F4RGPRQ5" },
    { volume: 3, days: "Days 181–270", url: "https://www.amazon.ca/dp/B0F89DN85G" },
    { volume: 4, days: "Days 271–360", url: "https://www.amazon.ca/dp/B0FVVM42PN" },
    { volume: 5, days: "Days 361–450", url: "https://www.amazon.ca/dp/B0GHXYLLNY" },
    { volume: 6, days: "Days 451–540", url: "https://www.amazon.ca/dp/B0GXW6VL8P" },
    { volume: 7, days: "Days 541–630", url: "https://www.amazon.ca/dp/B0H99L8DBW" },
  ],
};
