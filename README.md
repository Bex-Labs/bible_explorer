# Bible Explorer Website

A daily Bible devotional site for kids. Static HTML/CSS/JS site with a
[Supabase](https://supabase.com) backend for:

- **Free e-copy requests**: pick a volume, get an instant download link
  right on the page (no email delivery needed) if that volume has one
  set up; the request is also logged to a worldwide subscriber list
- **Buy the print book** (Amazon links + thumbnails, by volume), and
  sign in with a magic link to unlock the free e-copy download for any
  volume, then share that volume with a friend by name + email
- **Community forum**: a simple micro-blog where readers post short
  reflections on each day's lesson
- **Admin page**: add/edit/remove volumes (with thumbnail + e-copy PDF
  upload), moderate forum posts, and follow up on shared-volume
  requests, all gated to allowlisted admin emails

No build step, no framework. Every page is a plain `.html` file, so it
deploys anywhere that serves static files (GitHub Pages, Netlify, Vercel,
Cloudflare Pages, etc.) and is easy to hand-edit later.

**Repo:** https://github.com/Bex-Labs/bible_explorer
**Supabase project:** https://fmorjnjlwkgfunhcxsll.supabase.co

## Project structure

```
bible-explorer/
├── index.html          Home page
├── about.html           About the devotional
├── reading-plan.html    How the reading plan works + sample lessons
├── signup.html          Request a volume, get an instant download link
├── buy.html               Volumes for sale, sign in to unlock downloads
├── forum.html             Community forum (Supabase Auth + posts)
├── admin.html             Admin: manage volumes + moderate posts
├── 404.html                Not-found page
├── css/
│   └── styles.css        Shared design system (colors, type, components)
├── js/
│   ├── config.js           Supabase URL/key + fallback volume list
│   ├── supabase-client.js  Initializes the Supabase client
│   ├── volumes.js           Loads the volume catalog for buy.html
│   ├── nav.js               Mobile nav toggle + active link highlighting
│   ├── signup.js             Signup form → `subscribers` table
│   ├── buy.js                 Sign-in gate for downloads + share-a-friend
│   ├── forum.js               Auth + posts → `posts` table
│   └── admin.js                Admin auth + volumes/moderation/shares panels
├── assets/
│   ├── Biblexplorer_logo.gif   Site logo, used in the header + footer
│   ├── logo.svg                  Original placeholder logo, unused now
│   └── favicon.svg
├── supabase/
│   └── schema.sql          Run this in Supabase to create tables + policies
├── api/
│   ├── upload.php          Admin-only e-copy PDF upload (self-hosted)
│   └── check-limits.php    Confirms live PHP upload limits, safe to delete
└── uploads/                Where uploaded PDFs/images end up, publicly
    ├── downloads/            served, script execution disabled (.htaccess)
    └── thumbnails/
```

## 1. Supabase: already connected, finish the dashboard setup

`js/config.js` already points at the live project
(`fmorjnjlwkgfunhcxsll.supabase.co`) with its publishable key. Two things
still need to happen in the Supabase Dashboard before signups/forum posts
will actually work:

1. **SQL Editor** → paste in the contents of `supabase/schema.sql` and
   run it. This creates:
   - `subscribers`: name, email, country, age_group, plus
     `requested_volume_number` / `requested_volume_label` (which volume
     they asked for). Public **insert** only. Nobody can read the list
     from the client, keeping emails private. Not unique on email: the
     same person can sign up again later to request a different
     volume, so each request is its own row.
   - `admins`: an allowlist of emails with admin rights. The script
     seeds it with `bexinnovation@outlook.com`. Add more emails here
     (via SQL Editor or Table Editor) to grant more admins.
   - `volumes`: the print/e-copy catalog shown on `buy.html` (day
     range, Amazon link, thumbnail, download link). Public **read**,
     admin-only **insert/update/delete**. Seeded with the 7 volumes
     that used to be hardcoded in `js/config.js`.
   - `posts`: the forum's reflections, now with a `status` column
     (`visible`/`hidden`). Public reads only see `visible` posts;
     admins see and can toggle/delete everything.
   - `volume_shares`: "share this volume with a friend" requests from
     buy.html (recipient name/email, which volume, who shared it).
     Only signed-in readers can create one; only admins can read,
     update, or delete them from the client.
   - Two Storage buckets, `volume-thumbnails` and `volume-downloads`
     (both public-read, admin-only write) for volume cover images and
     e-copy PDFs.
2. **Authentication → Providers**: make sure **Email** is enabled
   (magic link / OTP is on by default).
3. **Authentication → URL Configuration**: add your deployed site URL
   (e.g. `https://bex-labs.github.io/bible_explorer/`, or your custom
   domain, plus `http://localhost:8080` while testing) to the allowed
   redirect URLs. This covers magic-link sign-in on the forum, the
   admin page, and the Buy page's download unlock.

If you ever need to rotate the key or point at a different Supabase
project, update `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `js/config.js`
(found in Supabase Dashboard → Project Settings → API).

## 2. Managing volumes (thumbnails, Amazon links, downloads)

Go to `admin.html` on your deployed site (or `http://localhost:8080/admin.html`
locally) and sign in with `bexinnovation@outlook.com`. You'll get a
magic-link email, click it, and you're in. From there:

- **Add a volume**: fill in the volume number, day range, Amazon link,
  and optionally upload a cover thumbnail and the e-copy PDF, then
  **Add Volume**.
- **Edit a volume**: change any field in its table row (or attach a new
  thumbnail/PDF to replace the current one) and click **Save**.
- **Delete a volume**: removes it from the Buy page immediately.

Thumbnails upload to Supabase Storage, same as before. E-copy PDFs
upload somewhere different: `/api/upload.php`, a small PHP script that
saves the file right on this same cPanel hosting account instead of
Supabase Storage (keeps the larger files off Supabase's free-tier
storage/bandwidth caps). See "Self-hosted e-copy uploads" below for how
that works and what it needs from your hosting. This only works once
admin.html is served from a host that actually runs that PHP file, so
uploading a PDF from the local static preview or from GitHub Pages
won't work, that's expected, not a bug, you'd need to do that part on
the live cPanel domain.

The Buy page (`buy.html`) always reflects whatever is in the `volumes`
table live, no code changes needed when you publish a new volume.
`js/config.js` still has a small `AMAZON_VOLUMES` fallback list, but
it's only used if the site can't reach Supabase at all.

To add another admin later, add their email to the `admins` table
(SQL Editor: `insert into public.admins (email) values ('someone@example.com');`).

## 3. How the free e-copy request works

`signup.html` shows a dropdown of every volume in the `volumes` table
(most recent first) alongside the name/email/country fields. When
someone submits:

- Their request (including which volume) is saved to `subscribers`.
- If that volume has a `download_url` set (see above), they immediately
  see a **Download Volume N Now** button right on the page. No email is
  sent, it's an instant link, same as clicking Download on `buy.html`.
- If that volume doesn't have a download link yet, they see a "we've
  saved your request" message instead, with nothing to click yet.

So the fastest way to make a volume requestable is the same admin step
as before: add a download link for it in `admin.html`. There's still no
automated email step, "Actually send the e-copies" below covers that as
a future option if you want signup to also trigger an email.

## 4. Downloading from the Buy page, and sharing with a friend

`buy.html` shows every volume to everyone: no sign-in is needed to
click **Buy on Amazon**. Downloading the free e-copy is different:
each volume with a download link shows a **Sign In to Unlock Free
Downloads** box instead of the download button until the visitor signs
in with a magic link (same one-click flow as the Community forum and
admin.html). Once signed in:

- Every volume that has a download link now shows a real
  **Download E-Copy** button.
- Next to it, an **✉️ Share This Volume** button opens a small form for
  a friend's name and email. Submitting it saves a row to
  `volume_shares`, it does not send an email yet.
- That friend isn't emailed automatically. `admin.html`'s new
  **Shared Requests** tab lists every request (name, email, volume,
  who shared it) so an admin can send them a signup link by hand, then
  mark it **Mark Sent**. See "Actually send an email too" below for
  the fully automated version of this.

## 5. Moderating the community forum

Also on `admin.html`, the **Community Moderation** panel lists every
post (newest first) with **Hide**/**Unhide** and **Delete** buttons.
Posts go live immediately when readers submit them; hiding one removes
it from the public forum feed right away without deleting it (useful if
you want to review before permanently removing), and Delete is
permanent.

## 6. Preview locally

Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or whatever port it prints).

> Opening the HTML files directly via `file://` mostly works too, but
> some browsers restrict `fetch`/CORS on `file://`. A local server is
> more reliable, especially for testing the forum/signup.

## 7. Deploy

Because this is a plain static site, you can deploy it to:

- **GitHub Pages**: push this folder to the repo, then enable Pages in
  the repo settings (Settings → Pages → Deploy from branch).
- **Netlify / Vercel / Cloudflare Pages**: connect the repo, no build
  command needed, publish directory is the repo root.

Remember to add the deployed URL to Supabase's **Authentication → URL
Configuration → Redirect URLs**, or magic-link sign-in on the forum page
will fail after deployment.

## 8. Pushing to GitHub

The repo already exists at https://github.com/Bex-Labs/bible_explorer.
From this folder:

```bash
cd bible-explorer
git init
git add .
git commit -m "Initial Bible Explorer website"
git branch -M main
git remote add origin https://github.com/Bex-Labs/bible_explorer.git
git push -u origin main
```

If the GitHub repo was created with a README/license/.gitignore already
in it, pull first (`git pull origin main --allow-unrelated-histories`)
or push with `git push -u origin main --force` only if you're sure the
remote has nothing you need to keep.

## 9. Deploying to cPanel (replacing the old site)

This site can also be deployed straight from GitHub using cPanel's
**Git Version Control** feature, so your production domain runs
Bible Explorer instead of (or alongside) GitHub Pages. This repo
includes a `.cpanel.yml` file that does the actual "copy files into
public_html" step; you just need to fill in your cPanel username and
wire up the repo once.

**Before you start:** back up whatever is currently in `public_html`
for this domain (cPanel → File Manager → select everything in
`public_html` → Compress → download the zip, or grab it over FTP).
Deploying will overwrite those files.

1. **Edit `.cpanel.yml`** in this repo: replace `CPANEL_USERNAME` in
   `export DEPLOYPATH=/home/CPANEL_USERNAME/public_html/` with your
   real cPanel username (shown in the top right of the cPanel
   dashboard, or in WHM). Commit and push that change to GitHub.
2. In cPanel, go to **Files → Git™ Version Control → Create**.
   - **Clone URL**: `https://github.com/Bex-Labs/bible_explorer.git`
   - **Repository Path**: something *outside* `public_html`, e.g.
     `/home/CPANEL_USERNAME/repositories/bible_explorer`. Don't point
     this at `public_html` directly, it needs to stay a plain git
     clone; `.cpanel.yml`'s job is to copy the files over from here.
   - Click **Create**. If the repo were private you'd need a deploy
     key, but since it's already public on GitHub (that's how GitHub
     Pages serves it) a plain HTTPS clone should just work.
3. Back on the Git Version Control list, click **Manage** on the new
   repo, then the **Pull or Deploy** tab:
   - **Update from Remote** pulls the latest commit from GitHub into
     that clone (this is a `git pull`, nothing is live yet).
   - **Deploy HEAD Commit** runs `.cpanel.yml`'s task, copying the
     site's files into `public_html`. This is the step that actually
     makes it live.
4. Check the domain in a browser. If it doesn't look right, confirm
   `DEPLOYPATH` in `.cpanel.yml` matches the exact `public_html` path
   cPanel showed you when creating the repository.
5. **Enable SSL** for the domain if it isn't already (cPanel →
   Security → SSL/TLS Status → Run AutoSSL), so the site loads over
   `https://`.
6. **Add the domain to Supabase**: Authentication → URL Configuration
   → Redirect URLs, add your live domain (e.g.
   `https://yourdomain.com/forum.html`, `/admin.html`, and `/buy.html`,
   or a wildcard like `https://yourdomain.com/*` if your Supabase
   project's redirect matching supports it). Keep the existing GitHub
   Pages URL in that list too if you're keeping Pages around as a
   staging copy, both can coexist.

**Going forward**, whenever you push a change to GitHub, the cPanel
domain does *not* update automatically, you need to go back into
**Git Version Control → Manage → Pull or Deploy** and click
**Update from Remote** then **Deploy HEAD Commit** again each time.
If that becomes annoying, a next step is wiring a GitHub webhook to
call cPanel's UAPI/WHM API to trigger that pull+deploy automatically
on every push, that's a bit more setup (an API token and a small
receiving script) and can be added later if you want it.

> Note: `js/config.js` now contains the real Supabase publishable key.
> That key is meant to be public (it only grants what the Row Level
> Security policies in `schema.sql` allow), so it's fine to commit even
> in a public repo. Just don't ever put a Supabase **service role** key
> in this file or anywhere client-side.

## 10. Self-hosted e-copy uploads (api/upload.php)

E-copy PDFs uploaded from admin.html are saved on this same cPanel
hosting account (`/uploads/downloads/`) instead of Supabase Storage,
this keeps the larger files off Supabase's free-tier storage/bandwidth
limits, since hosting disk space and bandwidth here are already paid
for. Thumbnails still go to Supabase Storage as before, they're small
enough that it doesn't matter.

**How it stays safe**, even though this endpoint has no login form of
its own: every upload request has to include the admin's current
Supabase sign-in token, and `api/upload.php` calls Supabase's own
`is_admin()` check with that token before accepting anything, the same
check every other admin action already depends on. It also only ever
accepts a real PDF for an e-copy or a real image for a thumbnail
(checked by the file's actual content, not its name), generates the
saved filename itself rather than trusting the browser, and
`uploads/.htaccess` turns off script execution for that whole folder,
so nothing saved there can ever run as code, only ever be served as a
plain file.

**Two things to check on your hosting** before this works:

1. **PHP upload limits**: cPanel's default PHP settings often cap
   uploads around 2-8 MB, too small for some e-copy PDFs. This repo
   already raises them for you, no cPanel panel access needed:
   `api/.user.ini` sets `upload_max_filesize`/`post_max_size` to 30M
   for hosts where PHP runs as CGI/FastCGI/LiteSpeed (the most common
   cPanel setup today), and `api/.htaccess` has a matching fallback
   for the less common case where PHP runs as an Apache module. If
   your host does expose **MultiPHP INI Editor** (Software section)
   or **Select PHP Version**'s own options tab, either also works and
   overrides the same settings from the panel side. Either way, visit
   `https://yourdomain.com/api/check-limits.php` after deploying, it
   reports the live `upload_max_filesize`/`post_max_size` values and
   tells you plainly whether they're high enough, changes to
   `.user.ini` can take a few minutes to kick in (PHP caches it
   briefly), so refresh that page again if it still looks low right
   after deploying. Safe to leave in place, or delete it once
   confirmed, your choice.
2. **The `Authorization` header reaching PHP**: most cPanel PHP setups
   pass this through fine, `api/.htaccess` includes a fallback rewrite
   rule for the setups that don't. If uploads fail with "Missing
   sign-in token" even though you're clearly signed in as an admin,
   this is the first thing to check with your host.

If you ever move hosts or the folder structure changes, the only
thing to update is `$UPLOAD_ROOT` at the top of `api/upload.php` (and
`UPLOAD_ENDPOINT` in `js/admin.js` if the script's URL path changes).

## Next steps / ideas

- **Actually send an email too**: right now, requesting a volume shows
  an instant download link on the page instead of emailing anything,
  and sharing a volume with a friend just saves that request for an
  admin to email by hand. If you want either of these automated, a
  natural next step is a Supabase Database Webhook (on `subscribers`
  insert, or on `volume_shares` insert) → a Supabase Edge Function →
  an email provider (Resend, Postmark, SendGrid) that emails the PDF
  or the signup link.
- **More Amazon marketplaces**: links are currently Amazon.ca only. If
  you get dedicated .com/.co.uk listings later, add a second URL column
  (or a small `region` table) and extend `buy.html` / `admin.html` to
  show the right link per visitor's region.
- **Real branding**: the logo is `assets/Biblexplorer_logo.gif` (swap
  that file, or update the `assets/Biblexplorer_logo.gif` references
  across the HTML pages to point elsewhere), `assets/favicon.svg` for
  the browser tab icon, and the color variables at the top of
  `css/styles.css` for the rest of the brand.
- **Approval-first moderation**: posts currently go live immediately
  and are only removed after the fact. If you'd rather review before
  anything is public, change the `posts.status` default from `'visible'`
  to `'pending'`, add `'pending'` to the allowed status values, and add
  an **Approve** action next to Hide/Delete in `admin.html`.
- **Daily lesson content**: `reading-plan.html` currently shows three
  static sample lessons. If you want the *actual* daily lesson driven by
  today's date, that's a good candidate for a `lessons` table in
  Supabase, keyed by day number.
