# Bible Explorer Website

A daily Bible devotional site for kids. Static HTML/CSS/JS site with a
[Supabase](https://supabase.com) backend for:

- **Free e-copy signups** (worldwide email list)
- **Buy the print book** (Amazon links, by volume)
- **Community forum** — a simple micro-blog where readers post short
  reflections on each day's lesson

No build step, no framework — every page is a plain `.html` file, so it
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
├── buy.html               Amazon "buy" links, one card per volume
├── forum.html             Community forum (Supabase Auth + posts)
├── 404.html                Not-found page
├── css/
│   └── styles.css        Shared design system (colors, type, components)
├── js/
│   ├── config.js           Supabase URL/key + Amazon volume links
│   ├── supabase-client.js  Initializes the Supabase client
│   ├── nav.js               Mobile nav toggle + active link highlighting
│   ├── signup.js             Signup form → `subscribers` table
│   └── forum.js               Auth + posts → `posts` table
├── assets/
│   ├── logo.svg
│   └── favicon.svg
└── supabase/
    └── schema.sql          Run this in Supabase to create tables + policies
```

## 1. Supabase — already connected, finish the dashboard setup

`js/config.js` already points at the live project
(`fmorjnjlwkgfunhcxsll.supabase.co`) with its publishable key. Two things
still need to happen in the Supabase Dashboard before signups/forum posts
will actually work:

1. **SQL Editor** → paste in the contents of `supabase/schema.sql` and
   run it. This creates two tables:
   - `subscribers` — name, email, country, age_group (public **insert**
     only — nobody can read the list from the client, keeping emails
     private).
   - `posts` — the forum's reflections (public **read**, authenticated
     **insert/delete-own**).
2. **Authentication → Providers** — make sure **Email** is enabled
   (magic link / OTP is on by default).
3. **Authentication → URL Configuration** — add your deployed site URL
   (e.g. `https://bex-labs.github.io/bible_explorer/`, or your custom
   domain, plus `http://localhost:8080` while testing) to the allowed
   redirect URLs, so magic-link sign-in works on the forum page.

If you ever need to rotate the key or point at a different Supabase
project, update `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `js/config.js`
(found in Supabase Dashboard → Project Settings → API).

## 2. Amazon volume links

`js/config.js` → `AMAZON_VOLUMES` lists all 7 current volumes (each
covering 90 days) with their real Amazon.ca links. The Buy page renders
this list automatically — add a new entry whenever a new volume is
published:

```js
AMAZON_VOLUMES: [
  { volume: 8, days: "Days 631–720", url: "https://www.amazon.ca/dp/XXXXXXXXXX" },
  // ...existing volumes
],
```

## 3. Preview locally

Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or whatever port it prints).

> Opening the HTML files directly via `file://` mostly works too, but
> some browsers restrict `fetch`/CORS on `file://` — a local server is
> more reliable, especially for testing the forum/signup.

## 4. Deploy

Because this is a plain static site, you can deploy it to:

- **GitHub Pages** — push this folder to the repo, then enable Pages in
  the repo settings (Settings → Pages → Deploy from branch).
- **Netlify / Vercel / Cloudflare Pages** — connect the repo, no build
  command needed, publish directory is the repo root.

Remember to add the deployed URL to Supabase's **Authentication → URL
Configuration → Redirect URLs**, or magic-link sign-in on the forum page
will fail after deployment.

## 5. Pushing to GitHub

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
> in a public repo — just don't ever put a Supabase **service role** key
> in this file or anywhere client-side.

## Next steps / ideas

- **Actually send the e-copies**: right now, signups just land in the
  `subscribers` table. A natural next step is a Supabase Database
  Webhook on `subscribers` insert → a Supabase Edge Function → an email
  provider (Resend, Postmark, SendGrid) that emails the PDF/e-copy.
- **More Amazon marketplaces**: links are currently Amazon.ca only. If
  you get dedicated .com/.co.uk listings later, it's easy to extend
  `AMAZON_VOLUMES` (or reintroduce a per-region structure) in
  `js/config.js`.
- **Real branding**: swap `assets/logo.svg` / `assets/favicon.svg` and
  the color variables at the top of `css/styles.css` for your brand.
- **Moderation**: the forum currently lets any signed-in user post
  freely. If this grows, consider adding a `status` column to `posts`
  (e.g. pending/approved) with a policy that only shows `approved` posts
  publicly, moderated via the Supabase Dashboard.
- **Daily lesson content**: `reading-plan.html` currently shows three
  static sample lessons. If you want the *actual* daily lesson driven by
  today's date, that's a good candidate for a `lessons` table in
  Supabase, keyed by day number.
