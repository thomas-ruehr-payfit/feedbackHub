# Feedback Hub

A lightweight tool for reviewing deployed prototypes. Add a prototype URL, open the viewer, and leave pinned comments directly on top of the prototype.

---

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In the SQL Editor, run these two blocks:

**Table: prototypes**
```sql
create table prototypes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  url        text not null,
  created_at timestamptz default now()
);

alter table prototypes enable row level security;
create policy "public read"   on prototypes for select using (true);
create policy "public insert" on prototypes for insert with check (true);
create policy "public delete" on prototypes for delete using (true);
```

**Table: comments**
```sql
create table comments (
  id             uuid primary key default gen_random_uuid(),
  prototype_id   uuid not null references prototypes(id) on delete cascade,
  page_path      text not null default '/',
  x_pct          float not null,
  y_pct          float not null,
  author         text not null,
  message        text not null,
  created_at     timestamptz default now()
);

create index on comments (prototype_id, page_path);

alter table comments enable row level security;
create policy "public read"   on comments for select using (true);
create policy "public insert" on comments for insert with check (true);
create policy "public delete" on comments for delete using (true);
```

3. Go to **Project Settings → API** and copy:
   - Project URL
   - `anon` / public key

---

### 2. Fill in `env.js`

Copy `env.example.js` to `env.js` and paste your credentials:

```js
window.ENV = {
  SUPABASE_URL: 'https://your-project-id.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key-here',
};
```

`env.js` is gitignored — your credentials will never be committed.

---

### 3. Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Vercel will auto-detect Vite. No extra config needed.
4. Set `env.js` values as **Environment Variables** in Vercel if you want to avoid committing them even to a private repo (optional — the file is already gitignored).

> **Note:** Because `env.js` is gitignored, Vercel won't have it at build time. The simplest approach: keep `env.js` local for dev, and add `SUPABASE_URL` / `SUPABASE_ANON_KEY` as Vercel env vars, then update `env.js` to read from `import.meta.env` — or just accept that you'll need to add a committed `env.js` to your Vercel deployment by adding it via the dashboard's file override, or keep it as a non-gitignored file in a private repo.
>
> **Simplest path for a private repo:** remove `env.js` from `.gitignore`, fill it in, and push. Since the repo is private, credentials are safe.

---

## Daily workflow

1. Open the dashboard at your Vercel URL.
2. Click **+ New prototype**, paste a name and URL.
3. Click **Open** to enter the viewer.
4. Share the viewer URL with teammates (it includes the prototype ID in the query string).
5. Click **Comment** to toggle comment mode, then click anywhere on the prototype to leave a pin.

---

## Optional: per-page comment tracking

If your prototype is a multi-page app, paste this snippet into it to track which screen a comment was made on:

```js
// Feedback Hub — per-page comment tracking
const send = () => window.parent.postMessage(
  { type: 'routeChange', path: location.pathname + location.hash }, '*'
);
window.addEventListener('load', send);
window.addEventListener('popstate', send);
window.addEventListener('hashchange', send);
```

Without this snippet, all comments are stored under `/` and shown on every page. With it, comments are filtered to the page they were made on.
