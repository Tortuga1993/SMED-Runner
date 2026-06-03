# SMED Runner

A shared, multi-operator SMED (Single Minute Exchange of Die) changeover planning tool. Plan tasks across 1–10 operators, balance their workload by drag-and-drop, simulate the changeover live, and export Gantt charts and Excel templates. All projects and folders are shared across your whole company via a Supabase database.

---

## How to deploy to Vercel (about 5 minutes)

You do **not** need to install anything or write any code. There are two easy ways.

### Option A — Drag and drop (simplest, no account tools needed)

1. Go to **https://vercel.com** and sign up for a free account (you can sign in with Google, GitHub, or email).
2. On your computer, **unzip this folder** so you have a folder called `smed-vercel` with files inside it (package.json, index.html, src, etc.).
3. In Vercel, click **Add New… → Project**.
4. Look for the **"Deploy a template"** area, or scroll to find the option to **import / upload**. If you see a GitHub import screen, use Option B below instead — it's just as easy.
5. If a drag-and-drop upload box is offered, drag the whole `smed-vercel` folder into it.
6. Vercel auto-detects it's a **Vite** project. Leave all settings as default and click **Deploy**.
7. After a minute you'll get a live URL like `https://smed-runner-xxxx.vercel.app`.

### Option B — Via GitHub (recommended for easy future updates)

1. Create a free account at **https://github.com** if you don't have one.
2. Create a new repository (name it `smed-runner`, keep it Private if you prefer).
3. Upload all the files from this `smed-vercel` folder into that repository
   (GitHub lets you drag files straight into the browser: on the repo page click
   **Add file → Upload files**, then drag everything in).
4. Go to **https://vercel.com**, sign in, click **Add New… → Project**.
5. Click **Import** next to your `smed-runner` GitHub repository.
6. Vercel auto-detects **Vite** — leave everything default and click **Deploy**.
7. You'll get a live URL like `https://smed-runner-xxxx.vercel.app`.

That URL is what you share with your whole team. Everyone who opens it sees the same shared boards and folders.

---

## Updating the app in future

- **Option A (drag/drop):** Re-deploy the updated folder the same way. Your Supabase data is untouched — it lives in the database, not in the app.
- **Option B (GitHub):** Just upload the changed files to your GitHub repo. Vercel automatically rebuilds and redeploys within a minute. Again, **no data is lost** — the database is completely separate from the app code.

---

## Custom name (optional)

In Vercel, open your project → **Settings → Domains** and you can rename it to something like `smed.vercel.app` (if available) or connect your own company domain such as `smed.yourcompany.com`.

---

## Your shared database

This app is already connected to your Supabase project. Projects and folders created by anyone are saved to the shared database and automatically sync to everyone else every 30 seconds (or instantly with the ↻ SYNC button).

The publishable key in the code is safe to expose in a browser — that's what it's designed for. Anyone with your app URL can read and edit boards, so share the URL only within your company.

---

## Local testing (optional, for developers only)

If you want to run it on your own machine first:

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

To make a production build:

```bash
npm run build
```

The finished site appears in the `dist` folder.
