# fb-scraper-nlp-pipeline

fb-scraper-nlp-pipeline is a unified Express.js service hosted on Render that serves as the data collection and processing engine for the Talisay, Batangas Incident System. It handles automated emergency messaging via Facebook Messenger and pulls public page activity via the Meta Graph API to log local incidents (such as floods, fires, landslides, etc.) in real time.

All data is structured and saved within a single PostgreSQL database powered by **Supabase**.

---

## 📋 Active Modules

### 1. Messenger Bot Module (AI Auto-Reply & Parsing)
- Receives webhook events from the Facebook Page Messenger platform.
- Automatically handles Tagalog/English responses using **Google Gemini** as the primary AI and **Groq (Llama 3)** as a reliable fallback.
- Extracts Talisay barangay names and emergency keywords from user chats, logging conversations into Supabase.

### 2. FB Page Scraper Module (Public Activity Processing)
- Periodically scrapes the target Facebook Page's posts and comments (default: every 60 seconds).
- Parses captions and comment texts using a keyword matching engine.
- Filters and assigns locations strictly matching the **21 official barangays of Talisay, Batangas** (otherwise defaults to `'Unknown'`).
- Logs all posts and comments into Supabase tables (`fb_posts` and `fb_comments`).
- Features a manual trigger API (`POST /scraper/run`) and a status API (`GET /scraper/status`).

---

## 🗺️ Scope: Talisay Batangas Barangays
All parsed locations are matched against the 21 official barangays:
> Aya, Balas, Banga, Buco, Caloocan, Leynes, Miranda, Poblacion Barangay 1, Poblacion Barangay 2, Poblacion Barangay 3, Poblacion Barangay 4, Poblacion Barangay 5, Poblacion Barangay 6, Poblacion Barangay 7, Poblacion Barangay 8, Quiling, Sampaloc, San Guillermo, Santa Maria, Tranca, Tumaway.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js & Express.js
- **Database:** Supabase (PostgreSQL)
- **AI Models:** Gemini API (`@google/genai`), Groq SDK (`groq-sdk`)
- **APIs:** Meta Graph API (v25.0)

---

## ⚙️ Environment Variables (.env)

Make sure the following environment variables are set in your local development environment and on Render:

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL=https://your-project-id.supabase.co
# ⚠️ service_role key is required to bypass RLS policies for server insertions
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# ── Facebook Messenger + Scraper ──────────────────────────────────────────────
PAGE_ACCESS_TOKEN=your_meta_page_access_token
VERIFY_TOKEN=your_webhook_verify_token
FB_PAGE_ID=your_facebook_page_numeric_id
GRAPH_API_VERSION=v25.0
# Scraper interval in seconds (60 = every 1 minute, 300 = every 5 minutes)
SCRAPER_INTERVAL_SECONDS=60

# ── AI Providers ──────────────────────────────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=models/gemini-2.5-flash
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# ── Bot Config ────────────────────────────────────────────────────────────────
BOT_SYSTEM_PROMPT="Ikaw ay Tagalog assistant, I'm replying to customers in Tagalog..."

# ── Internal API ──────────────────────────────────────────────────────────────
INTERNAL_API_KEY=your_secret_api_key_to_protect_endpoints

PORT=3000
```

---

## 🗄️ Database Setup (Supabase SQL)

Run this SQL query inside your Supabase SQL Editor to initialize the required tables, row-level security (RLS) configurations, and indices:

```sql
-- 1. Conversations table (Messenger Logs)
create table if not exists conversations (
  id              bigint generated always as identity primary key,
  conversation_id text        not null unique,
  sender_psid     text        not null,
  user_message    text        not null,
  ai_reply        text        not null,
  provider        text        not null default 'gemini',
  timestamp       timestamptz not null default now()
);
create index if not exists conversations_sender_psid_idx on conversations (sender_psid);
create index if not exists conversations_timestamp_idx   on conversations (timestamp desc);
alter table public.conversations enable row level security;
do $$ begin
  create policy "service_role full access" on public.conversations
    for all to service_role using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- 2. Facebook Posts table
create table if not exists fb_posts (
  id          text primary key,
  caption     text,
  post_date   timestamptz,
  barangay    text default 'Unknown',
  created_at  timestamptz default now()
);
alter table fb_posts enable row level security;
do $$ begin
  create policy "service_role full access" on fb_posts
    for all to service_role using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- 3. Facebook Comments table
create table if not exists fb_comments (
  id             text primary key,
  post_id        text references fb_posts(id),
  user_name      text,
  comment_text   text,
  comment_date   date,
  comment_time   time,
  barangay       text default 'Unknown',
  incident_type  text,
  created_at     timestamptz default now()
);
alter table fb_comments enable row level security;
do $$ begin
  create policy "service_role full access" on fb_comments
    for all to service_role using (true) with check (true);
exception when duplicate_object then null;
end $$;

create index if not exists fb_comments_post_id_idx  on fb_comments (post_id);
create index if not exists fb_comments_barangay_idx on fb_comments (barangay);
```

---

## 📡 API Endpoints

| Method | Endpoint | Headers | Description |
|---|---|---|---|
| `GET` | `/` | None | Lists all saved conversations, posts, and comments as structured JSON |
| `GET` | `/webhook` | URL Queries | Facebook App Webhook Verification |
| `POST` | `/webhook` | None | Handles incoming Messenger chats |
| `POST` | `/scraper/run` | `x-api-key: <INTERNAL_API_KEY>` | Manually triggers the Facebook Page scraper |
| `GET` | `/scraper/status` | None | Returns the status, last run time, and statistics of the scraper |

---

## 🚀 Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the application:
   ```bash
   npm start
   ```