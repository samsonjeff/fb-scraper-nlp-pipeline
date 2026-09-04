# fb-scraper-nlp-pipeline

> A unified Express.js service hosted on Render that serves as the data collection and processing engine for the Talisay, Batangas Incident System.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Meta Graph API](https://img.shields.io/badge/Meta%20Graph%20API-0467DF?style=for-the-badge&logo=meta&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## Table of Contents

- [Overview](#overview)
- [Development & Security Notice](#development--security-notice)
- [Active Modules & Features](#active-modules--features)
- [Scope: Talisay Batangas Barangays](#scope-talisay-batangas-barangays)
- [Tech Stack](#tech-stack)
- [Security & Credential Protection](#security--credential-protection)
- [Environment Configuration](#environment-configuration)
- [Database Schema (Supabase SQL)](#database-schema-supabase-sql)
- [API Endpoints](#api-endpoints)
- [Installation & Running Locally](#installation--running-locally)
- [License](#license)

---

## Overview

**fb-scraper-nlp-pipeline** is a production-ready backend pipeline designed for emergency and community incident monitoring in **Talisay, Batangas**. 

The system operates two primary workflows:
1. **Automated Emergency Messaging**: Handles incoming Facebook Messenger queries with AI-powered replies (Google Gemini with multi-key rotation pool), extracting reported barangay locations and emergency details.
2. **Public Page Activity Scraping**: Periodically scrapes public Facebook Page posts and comments using Meta Graph API, parsing texts for incident keywords and mapping them to official barangays in real time.

All structured data is persisted in a centralized **Supabase (PostgreSQL)** database.

---

> [!NOTE]
> ### Development & Security Notice
> This project was developed using **Google Antigravity IDE**. Portions of the codebase undergo manual inspection and validation prior to deployment. You are welcome to inspect, audit, or review the code for your personal verification or security purposes.

---

## Active Modules & Features

### 1. Messenger Bot Module (AI Auto-Reply & Parsing)
| Feature | Description |
|---|---|
| **Webhook Integration** | Real-time reception of Facebook Page Messenger webhooks |
| **Profile Extraction** | Real-time resolution of sender real name via Meta Graph API with in-memory caching |
| **AI Engine** | **Google Gemini** with multi-key rotation pool and automatic cooldown handling |
| **Entity Extraction** | Automatic extraction of Talisay barangays and emergency keywords |
| **Conversation Logging** | Full conversation history with sender real name logged into `conversations` table |
| **Human Handoff (Bot Pause)** | Pause bot replies (`/pause`, `/stop`) or resume (`/resume`, `/continue`) for live operator takeover |
| **Unsent Message Sync** | Periodic Graph API thread reconciliation detecting and pruning messages deleted/unsent by users |

### 2. FB Page Scraper Module (Public Activity Processing)
| Feature | Description |
|---|---|
| **Automated Scraping** | Periodic background scraping of posts and comments (default: 300s) |
| **Comment Reconciliation** | Compares active Graph API comment IDs against DB to automatically prune deleted comments |
| **Keyword Parsing Engine** | Text parsing for incident types (floods, fires, landslides, etc.) |
| **Strict Location Filtering** | Location matching strictly against the **21 official barangays of Talisay, Batangas** (defaults to `'Unknown'`) |
| **Data Persistence** | Structured saving into `fb_posts` and `fb_comments` tables with upsert handling for comment edits |
| **Control APIs** | Manual trigger endpoint (`POST /scraper/run`) and status monitor (`GET /scraper/status`) |

---

## Scope: Talisay Batangas Barangays

All parsed locations are matched strictly against the 21 official barangays of Talisay, Batangas:

> Aya, Balas, Banga, Buco, Caloocan, Leynes, Miranda, Poblacion Barangay 1, Poblacion Barangay 2, Poblacion Barangay 3, Poblacion Barangay 4, Poblacion Barangay 5, Poblacion Barangay 6, Poblacion Barangay 7, Poblacion Barangay 8, Quiling, Sampaloc, San Guillermo, Santa Maria, Tranca, Tumaway.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime & Server** | Node.js, Express.js |
| **Database** | Supabase (PostgreSQL with RLS) |
| **AI Provider** | `@google/genai` (Gemini Flash with multi-key pool) |
| **Social API** | Meta Graph API (v25.0) |
| **Utilities** | `localtunnel`, `node-cron`, `helmet`, `express-rate-limit` |

---

## Security & Credential Protection

### Security Implementations
| Layer | Implementation Details |
|---|---|
| **Environment Variables** | Secrets (`SUPABASE_SERVICE_KEY`, `PAGE_ACCESS_TOKEN`, API Keys) stored in `.env` |
| **Git Exclusion** | `.env` explicitly excluded from version control via `.gitignore` |
| **Endpoint Protection** | Internal scraper endpoints protected via `x-api-key` header verification |
| **Rate Limiting & Security Headers** | Express application hardened with `helmet` and `express-rate-limit` |

---

## Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

```env
# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL=https://your-project-id.supabase.co
# ⚠️ service_role key is required to bypass RLS policies for server insertions
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# ── Facebook Messenger + Scraper ──────────────────────────────────────────────
PAGE_ACCESS_TOKEN=your_meta_page_access_token
META_ACCESS_TOKEN=your_permanent_meta_access_token
VERIFY_TOKEN=your_webhook_verify_token
APP_SECRET=your_facebook_app_secret
FB_PAGE_ID=your_facebook_page_numeric_id
GRAPH_API_VERSION=v25.0
# Scraper interval in seconds (default: 300 = every 5 minutes)
SCRAPER_INTERVAL_SECONDS=300
# Messenger sync interval in seconds (default: 300 = every 5 minutes)
MESSENGER_SYNC_INTERVAL_SECONDS=300

# ── AI Configuration ──────────────────────────────────────────────────────────
GEMINI_API_KEYS=key1,key2,key3,key4,key5
GEMINI_MODEL=models/gemini-3.6-flash

# ── Bot Config ────────────────────────────────────────────────────────────────
BOT_SYSTEM_PROMPT="Ikaw ay Tagalog assistant, I'm replying to customers in Tagalog..."

# ── Internal API ──────────────────────────────────────────────────────────────
INTERNAL_API_KEY=your_secret_api_key_to_protect_endpoints

PORT=3000
```

---

## Database Schema (Supabase SQL)

Run this script inside your Supabase SQL Editor to initialize required tables, policies, and indices:

```sql
-- 1. Conversations table (Messenger Logs)
create table if not exists conversations (
  id              bigint generated always as identity primary key,
  conversation_id text        not null unique,
  sender_psid     text        not null,
  sender_name     text        default 'Unknown User',
  user_message    text        not null,
  ai_reply        text        not null,
  provider        text        not null default 'gemini',
  timestamp       timestamptz not null default now()
);
create index if not exists conversations_sender_psid_idx on conversations (sender_psid);
create index if not exists conversations_sender_name_idx on conversations (sender_name);
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

-- 4. Processed Messages table (Webhook Deduplication)
-- Prevents duplicate processing when multiple server instances receive the same message.
create table if not exists processed_messages (
  mid          text primary key,
  processed_at timestamptz default now()
);
alter table processed_messages enable row level security;
do $$ begin
  create policy "service_role full access" on processed_messages
    for all to service_role using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- 5. User States table (Human Handoff / Bot Pause)
-- Tracks whether automated AI replies are paused for a specific user to allow human operator chats.
create table if not exists user_states (
  sender_psid text primary key,
  sender_name text default 'Unknown User',
  bot_paused  boolean not null default false,
  paused_at   timestamptz,
  updated_at  timestamptz not null default now()
);
alter table user_states enable row level security;
do $$ begin
  create policy "service_role full access" on user_states
    for all to service_role using (true) with check (true);
exception when duplicate_object then null;
end $$;
```

---

## API Endpoints

| Method | Endpoint | Headers | Description |
|---|---|---|---|
| `GET` | `/` | None | Health check endpoint returning service status and timestamp |
| `GET` | `/webhook` | URL Queries | Facebook App Webhook Verification (`hub.challenge`) |
| `POST` | `/webhook` | `x-hub-signature-256` | Handles incoming Messenger chats with signature verification |
| `POST` | `/scraper/run` | `x-api-key: <INTERNAL_API_KEY>` | Manually triggers the Facebook Page scraper and comment reconciliation |
| `GET` | `/scraper/status` | None | Returns the status, last run time, and statistics of the scraper |
| `GET` | `/api/debug/conversations` | `x-api-key: <INTERNAL_API_KEY>` | Fetches recent conversations, posts, and comments |
| `GET` | `/api/user-history/:senderPSID` | `x-api-key: <INTERNAL_API_KEY>` | Fetches chat history formatted for NLP context for a given PSID |
| `GET` | `/api/bot/state/:senderPSID` | `x-api-key: <INTERNAL_API_KEY>` | Returns whether automated bot replies are currently paused for a user |
| `POST` | `/api/bot/pause` | `x-api-key: <INTERNAL_API_KEY>` | Manually pauses automated bot replies for a specific `senderPSID` |
| `POST` | `/api/bot/resume` | `x-api-key: <INTERNAL_API_KEY>` | Manually resumes automated bot replies for a specific `senderPSID` |
| `POST` | `/api/reset-database` | `x-api-key: <INTERNAL_API_KEY>` | Clears all conversation records from the database |

---

## Human Handoff & Bot Pause / Resume Commands

When a human operator from the Facebook Page Inbox / Meta Business Suite wants to take over a conversation without the bot interfering:

| Action | Commands (Operator Only) | Description |
|---|---|---|
| **Stop / Pause Bot** | `/pause` or `/stop` | Pauses AI replies for that specific user. User messages are still logged to the database, but no bot response is generated. |
| **Resume / Continue Bot** | `/resume` or `/continue` | Re-enables automated AI responses for that specific user. |

> [!TIP]
> - **Operator-only:** Only the human operator typing in Facebook Page Inbox / Meta Business Suite can issue these commands. Users cannot pause/resume the bot themselves.
> - **Context-aware handoff:** While the bot is paused, operator replies are automatically logged to the database so that when the bot resumes, Gemini AI has full context of what the operator discussed with the user — no duplicate questions.
> - **Automatic Isolation:** Pausing only affects the specific user thread; other users chatting with the page continue receiving automated bot replies without disruption.

---

## Installation & Running Locally

1. **Clone the repository & install dependencies:**
   ```bash
   git clone https://github.com/samsonjeff/fb-scraper-nlp-pipeline.git
   cd fb-scraper-nlp-pipeline
   npm install
   ```

2. **Setup environment variables:**
   Create a `.env` file based on `.env.example` and populate your credentials.

3. **Start the application:**
   ```bash
   npm start
   ```

4. **(Optional) Run localtunnel for webhook testing:**
   ```bash
   npm run tunnel
   ```

5. **(Optional) Backfill real sender names for historical conversations:**
   ```bash
   node backfill-names.js
   ```

---

## License

This project is licensed under the [MIT License](LICENSE).