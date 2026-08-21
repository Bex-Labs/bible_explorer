# Bible Explorer Website

A daily Bible devotional site for kids. Static HTML/CSS/JS site with a
[Supabase](https://supabase.com) backend for:

- **Free e-copy signups** (worldwide email list)
- **Buy the print book** (Amazon links + thumbnails, by volume)
- **Community forum**: a simple micro-blog where readers post short
  reflections on each day's lesson
- **Admin page**: add/edit/remove volumes (with thumbnail + e-copy PDF
  upload) and moderate forum posts, gated to allowlisted admin emails

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
├── signup.html          Free e-copy signup form (writes to Supabase)
├── buy.html               Volumes for sale, loaded live from Supabase
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
│   ├── forum.js               Auth + posts → `posts` table
│   └── admin.js                Admin auth + volumes/moderation panels
├── assets/
│   ├── logo.svg
│   └── favicon.svg
└── supabase/
    └── schema.sql          Run this in Supabase to create tables + policies
```

## 1. Supabase: already connected, finish the dashboard setup

`js/config.js` already points at the live project
(`fmorjnjlwkgfunhcxsll.supabase.co`) with its publishable key. Two things
still need to happen in the Supabase Dashboard before signups/forum posts
will actually work:

1. **SQL Editor** → paste in the contents of `supabase/schema.sql` and
   run it. This creates:
   - `subscribers`: name, email, country, age_group (public **insert**
     only. Nobody can read the list from the client, keeping emails
     private).
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
   - Two Storage buckets, `volume-thumbnails` and `volume-downloads`
     (both public-read, admin-only write) for volume cover images and
     e-copy PDFs.
2. **Authentication → Providers**: make sure **Email** is enabled
   (magic link / OTP is on by default).
3. **Authentication → URL Configuration**: add your deployed site URL
   (e.g. `https://bex-labs.github.io/bible_explorer/`, or your custom
   domain, plus `http://localhost:8080` while testing) to the allowed
   redirect URLs. This covers magic-link sign-in on both the forum and
   the admin page.

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

The Buy page (`buy.html`) always reflects whatever is in the `volumes`
table live, no code changes needed when you publish a new volume.
`js/config.js` still has a small `AMAZON_VOLUMES` fallback list, but
it's only used if the site can't reach Supabase at all.

To add another admin later, add their email to the `admins` table
(SQL Editor: `insert into public.admins (email) values ('someone@example.com');`).

## 3. Moderating the community forum

Also on `admin.html`, the **Community Moderation** panel lists every
post (newest first) with **Hide**/**Unhide** and **Delete** buttons.
Posts go live immediately when readers submit them; hiding one removes
it from the public forum feed right away without deleting it (useful if
you want to review before permanently removing), and Delete is
permanent.

## 4. Preview locally

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

## 5. Deploy

Because this is a plain static site, you can deploy it to:

- **GitHub Pages**: push this folder to the repo, then enable Pages in
  the repo settings (Settings → Pages → Deploy from branch).
- **Netlify / Vercel / Cloudflare Pages**: connect the repo, no build
  command needed, publish directory is the repo root.

Remember to add the deployed URL to Supabase's **Authentication → URL
Configuration → Redirect URLs**, or magic-link sign-in on the forum page
will fail after deployment.

## 6. Pushing to GitHub

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

> Note: `js/config.js` now contains the real Supabase publishable key.
> That key is meant to be public (it only grants what the Row Level
> Security policies in `schema.sql` allow), so it's fine to commit even
> in a public repo. Just don't ever put a Supabase **service role** key
> in this file or anywhere client-side.

## Next steps / ideas

- **Actually send the e-copies**: right now, signups just land in the
  `subscribers` table. A natural next step is a Supabase Database
  Webhook on `subscribers` insert → a Supabase Edge Function → an email
  provider (Resend, Postmark, SendGrid) that emails the PDF/e-copy.
- **More Amazon marketplaces**: links are currently Amazon.ca only. If
  you get dedicated .com/.co.uk listings later, add a second URL column
  (or a small `region` table) and extend `buy.html` / `admin.html` to
  show the right link per visitor's region.
- **Real branding**: swap `assets/logo.svg` / `assets/favicon.svg` and
  the color variables at the top of `css/styles.css` for your brand.
- **Approval-first moderation**: posts currently go live immediately
  and are only removed after the fact. If you'd rather review before
  anything is public, change the `posts.status` default from `'visible'`
  to `'pending'`, add `'pending'` to the allowed status values, and add
  an **Approve** action next to Hide/Delete in `admin.html`.
- **Daily lesson content**: `reading-plan.html` currently shows three
  static sample lessons. If you want the *actual* daily lesson driven by
  today's date, that's a good candidate for a `lessons` table in
  Supabase, keyed by day number.
