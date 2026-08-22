<?php
/**
 * Bible Explorer: temporary diagnostic page
 * -------------------------------------------
 * Visit this file directly in a browser (e.g.
 * https://biblexplorer.ca/api/check-limits.php) to confirm whether
 * api/.user.ini (or api/.htaccess's php_value fallback) actually
 * raised PHP's upload limits on this hosting account. Safe to leave
 * in place, it only reveals these two settings, nothing sensitive,
 * but feel free to delete this file once you've confirmed it worked.
 */
header("Content-Type: text/plain");

$uploadMax = ini_get("upload_max_filesize");
$postMax = ini_get("post_max_size");

echo "upload_max_filesize: {$uploadMax}\n";
echo "post_max_size: {$postMax}\n";
echo "PHP version: " . phpversion() . "\n";
echo "\n";

if (preg_match('/^([0-9.]+)/', $uploadMax, $m) && (float) $m[1] >= 25) {
  echo "Looks good, this is at least 25M, uploads up to that size should work.\n";
} else {
  echo "This is still below 25M. If you just added api/.user.ini or\n";
  echo "api/.htaccess, wait a few minutes and refresh this page, PHP\n";
  echo "caches .ini files briefly. If it's still low after that, your\n";
  echo "host may need to raise it another way, contact their support\n";
  echo "with these two setting names.\n";
}
