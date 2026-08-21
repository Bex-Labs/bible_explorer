/**
 * Bible Explorer: shared volume-catalog loader
 * Used by buy.html. Prefers live data from the `volumes` table in
 * Supabase (managed via admin.html); falls back to the static list in
 * js/config.js if Supabase isn't configured or the request fails.
 *
 * Returns a promise resolving to an array of:
 *   { volume, days, amazonUrl, thumbnailUrl, downloadUrl }
 */
window.bibleExplorerLoadVolumes = async function () {
  const cfg = window.BIBLE_EXPLORER_CONFIG || {};
  const fallback = (cfg.AMAZON_VOLUMES || []).map(function (v) {
    return {
      volume: v.volume,
      days: v.days,
      amazonUrl: v.url,
      thumbnailUrl: null,
      downloadUrl: null,
    };
  });

  if (!window.bibleExplorerSupabaseReady) {
    return fallback;
  }

  const { data, error } = await window.bibleExplorerSupabase
    .from("volumes")
    .select("volume_number, days_label, amazon_url, thumbnail_url, download_url")
    .order("sort_order", { ascending: true })
    .order("volume_number", { ascending: true });

  if (error || !data || data.length === 0) {
    if (error) console.error(error);
    return fallback;
  }

  return data.map(function (v) {
    return {
      volume: v.volume_number,
      days: v.days_label,
      amazonUrl: v.amazon_url,
      thumbnailUrl: v.thumbnail_url,
      downloadUrl: v.download_url,
    };
  });
};
