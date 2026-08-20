/**
 * Bible Explorer — Supabase client bootstrap
 * Loaded after the Supabase UMD bundle and config.js on every page
 * that needs backend access (signup + forum).
 */
(function () {
  const cfg = window.BIBLE_EXPLORER_CONFIG || {};
  const isPlaceholder =
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL.includes("YOUR-PROJECT-REF") ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_ANON_KEY.includes("YOUR-SUPABASE-ANON-PUBLIC-KEY");

  if (isPlaceholder) {
    console.warn(
      "[Bible Explorer] Supabase is not configured yet. " +
        "Edit js/config.js with your project URL and anon key."
    );
    window.bibleExplorerSupabase = null;
    window.bibleExplorerSupabaseReady = false;
    return;
  }

  window.bibleExplorerSupabase = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );
  window.bibleExplorerSupabaseReady = true;
})();
