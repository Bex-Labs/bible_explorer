<?php
/**
 * Bible Explorer: admin-only file upload endpoint
 * ------------------------------------------------
 * Accepts a PDF (kind=download) or an image (kind=thumbnail) from a
 * signed-in Supabase admin and saves it into a public folder on this
 * same cPanel hosting account, then returns its public URL. This lets
 * admin.html keep its one-click "upload" experience while the actual
 * file lives on this server instead of Supabase Storage.
 *
 * Security model:
 *  - The caller must send `Authorization: Bearer <supabase access
 *    token>`. This script calls Supabase's own is_admin() RPC with
 *    that token to confirm the signed-in user is really an admin. It
 *    never trusts the client, and never keeps a password of its own,
 *    Supabase Auth stays the one source of truth for who's an admin.
 *  - Only PDF is accepted for kind=download, only common image types
 *    for kind=thumbnail, checked by the file's real content, not its
 *    name or extension.
 *  - The destination filename is generated here, never taken from the
 *    client, so a crafted filename can't do anything unexpected.
 *  - Uploaded files are saved under /uploads, which has its own
 *    .htaccess (see uploads/.htaccess) turning off script execution
 *    for that whole folder, so even an unexpected file there can only
 *    ever be served as a static file, never run as code.
 */

// ---- Configuration -------------------------------------------------
// Same public Supabase project URL + anon key already used in
// js/config.js. Both are meant to be public, the anon key only grants
// what this project's Row Level Security policies allow.
$SUPABASE_URL = "https://fmorjnjlwkgfunhcxsll.supabase.co";
$SUPABASE_ANON_KEY = "sb_publishable_ETPzf_uBMXJPfeta1Y92-g_ffiflxVv";

// Browser origins allowed to call this endpoint. Add a new one here
// (e.g. a different staging URL) if you ever need to.
$ALLOWED_ORIGINS = [
  "https://biblexplorer.ca",
  "https://bex-labs.github.io",
  "http://localhost:8080",
  "http://localhost:8000",
];

// Where uploaded files are saved, relative to this script's own
// folder. This script lives in /api, so ../uploads lands in the repo
// root's /uploads folder, which is public_html/uploads once deployed
// (see .cpanel.yml).
$UPLOAD_ROOT = __DIR__ . "/../uploads";

$MAX_BYTES = [
  "download" => 25 * 1024 * 1024,  // 25 MB, plenty for a devotional PDF
  "thumbnail" => 5 * 1024 * 1024,  // 5 MB
];

// kind => [ real content-type => file extension to save it with ]
$ALLOWED_TYPES = [
  "download" => [
    "application/pdf" => "pdf",
  ],
  "thumbnail" => [
    "image/jpeg" => "jpg",
    "image/png" => "png",
    "image/webp" => "webp",
    "image/gif" => "gif",
  ],
];

// ---- Small helpers ---------------------------------------------------
function fail($status, $message) {
  http_response_code($status);
  header("Content-Type: application/json");
  echo json_encode(["error" => $message]);
  exit;
}

function getAuthorizationHeader() {
  if (!empty($_SERVER["HTTP_AUTHORIZATION"])) {
    return $_SERVER["HTTP_AUTHORIZATION"];
  }
  // Some cPanel PHP setups (PHP-CGI/suPHP) strip the Authorization
  // header unless api/.htaccess forwards it, this is the fallback for
  // when it comes through under a different name instead.
  if (!empty($_SERVER["REDIRECT_HTTP_AUTHORIZATION"])) {
    return $_SERVER["REDIRECT_HTTP_AUTHORIZATION"];
  }
  if (function_exists("getallheaders")) {
    foreach (getallheaders() as $name => $value) {
      if (strcasecmp($name, "Authorization") === 0) {
        return $value;
      }
    }
  }
  return "";
}

// ---- CORS --------------------------------------------------------------
$origin = isset($_SERVER["HTTP_ORIGIN"]) ? $_SERVER["HTTP_ORIGIN"] : "";
if (in_array($origin, $ALLOWED_ORIGINS, true)) {
  header("Access-Control-Allow-Origin: " . $origin);
}
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Authorization, Content-Type");
header("Vary: Origin");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(204);
  exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  fail(405, "Method not allowed.");
}

// Wrap the real work so any unexpected PHP error still comes back as
// clean JSON, admin.js expects to be able to parse the response.
try {
  // ---- 1. Confirm the caller is a signed-in admin -----------------
  $authHeader = getAuthorizationHeader();
  if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
    fail(401, "Missing sign-in token, please sign in again and retry.");
  }
  $accessToken = trim($m[1]);

  $ch = curl_init(rtrim($SUPABASE_URL, "/") . "/rest/v1/rpc/is_admin");
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => "{}",
    CURLOPT_HTTPHEADER => [
      "apikey: " . $SUPABASE_ANON_KEY,
      "Authorization: Bearer " . $accessToken,
      "Content-Type: application/json",
    ],
    CURLOPT_TIMEOUT => 10,
  ]);
  $rpcBody = curl_exec($ch);
  $rpcStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $rpcError = curl_error($ch);
  curl_close($ch);

  if ($rpcBody === false || $rpcStatus !== 200) {
    fail(502, "Couldn't verify admin access right now: " . ($rpcError ?: $rpcBody));
  }

  $isAdmin = json_decode($rpcBody, true);
  if ($isAdmin !== true) {
    fail(403, "Not an admin account.");
  }

  // ---- 2. Validate what was uploaded -------------------------------
  // If the request body was bigger than PHP's own post_max_size (an
  // ini setting, separate from the $MAX_BYTES check below), PHP drops
  // the whole body silently, $_POST and $_FILES both come back empty
  // with no error flag to check. Catch that case with a clear message
  // instead of the confusing "Unknown upload kind" that would follow.
  if (empty($_POST) && empty($_FILES) && !empty($_SERVER["CONTENT_LENGTH"]) && (int) $_SERVER["CONTENT_LENGTH"] > 0) {
    fail(413, "That file is larger than this server's PHP upload limit (upload_max_filesize / post_max_size). Raise those in cPanel's MultiPHP INI Editor, then try again.");
  }

  $kind = isset($_POST["kind"]) ? $_POST["kind"] : "";
  if (!isset($ALLOWED_TYPES[$kind])) {
    fail(400, "Unknown upload kind.");
  }

  $volumeNumber = isset($_POST["volume_number"]) ? preg_replace('/[^0-9]/', '', (string) $_POST["volume_number"]) : "";
  if ($volumeNumber === "") {
    fail(400, "Missing volume number.");
  }

  if (!isset($_FILES["file"]) || $_FILES["file"]["error"] !== UPLOAD_ERR_OK) {
    fail(400, "No file was received, or the upload failed.");
  }

  $tmpPath = $_FILES["file"]["tmp_name"];
  $size = $_FILES["file"]["size"];

  if ($size > $MAX_BYTES[$kind]) {
    fail(413, "That file is too large.");
  }

  if (!class_exists("finfo")) {
    fail(500, "Server is missing the PHP fileinfo extension needed to check file types.");
  }
  $finfo = new finfo(FILEINFO_MIME_TYPE);
  $mime = $finfo->file($tmpPath);

  if ($mime === false || !isset($ALLOWED_TYPES[$kind][$mime])) {
    fail(415, "That file type isn't allowed for a " . $kind . ".");
  }
  $ext = $ALLOWED_TYPES[$kind][$mime];

  // ---- 3. Save it under a name this script controls, not the client -
  $folder = $kind === "download" ? "downloads" : "thumbnails";
  $destDir = $UPLOAD_ROOT . "/" . $folder;

  if (!is_dir($destDir) && !mkdir($destDir, 0755, true) && !is_dir($destDir)) {
    fail(500, "Couldn't prepare the destination folder.");
  }

  $filename = "vol" . $volumeNumber . "-" . time() . "-" . bin2hex(random_bytes(4)) . "." . $ext;
  $destPath = $destDir . "/" . $filename;

  if (!move_uploaded_file($tmpPath, $destPath)) {
    fail(500, "Couldn't save the uploaded file.");
  }
  @chmod($destPath, 0644);

  // ---- 4. Hand back the public URL ----------------------------------
  $scheme = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ? "https" : "http";
  $host = $_SERVER["HTTP_HOST"];
  $publicUrl = $scheme . "://" . $host . "/uploads/" . $folder . "/" . $filename;

  header("Content-Type: application/json");
  echo json_encode(["url" => $publicUrl]);
} catch (Throwable $e) {
  fail(500, "Unexpected server error: " . $e->getMessage());
}
