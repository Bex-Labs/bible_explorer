/**
 * Bible Explorer: Supabase configuration
 * ----------------------------------------
 * Values below point at the live Supabase project. If you ever spin up
 * a different project (e.g. a staging environment), update these from
 * Supabase Dashboard → Project Settings → API.
 *
 * The publishable/anon key is safe to expose in client-side code. It
 * only grants the permissions defined by Row Level Security policies
 * (see /supabase/schema.sql).
 */
window.BIBLE_EXPLORER_CONFIG = {
  SUPABASE_URL: "https://fmorjnjlwkgfunhcxsll.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ETPzf_uBMXJPfeta1Y92-g_ffiflxVv",

  // Fallback volume list, only used if buy.html can't reach Supabase
  // (e.g. credentials above aren't filled in yet). Once Supabase is
  // connected, the real list of volumes lives in the `volumes` table
  // and is managed from admin.html. This array is not read from
  // there anymore, so you don't need to edit it when adding volumes.
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
