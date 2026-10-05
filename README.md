# KaamQueue

WhatsApp chats in, tomorrow's to-do list out.

Small businesses paste a customer's WhatsApp message, pick their business type, and get a structured action slip with a draft reply in the customer's language.

## Stack
- **Frontend:** Single-file HTML (vanilla JS, no framework)
- **Backend:** Vercel serverless functions (`/api/process`, `/api/stats`)
- **AI:** Google Gemini 2.5 Flash Lite (via API)
- **Database:** Supabase (PostgreSQL)

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → run the contents of `supabase_setup.sql`
3. Copy your **Project URL** and **service_role key** from Settings → API

### 2. Gemini
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key (free tier)

### 3. Vercel
1. Push this repo to GitHub
2. Import it into [Vercel](https://vercel.com)
3. Add these **Environment Variables** in Vercel → Settings → Environment Variables:
   - `GEMINI_API_KEY` → your Google AI Studio key
   - `SUPABASE_URL` → your Supabase project URL (e.g. `https://xyz.supabase.co`)
   - `SUPABASE_SERVICE_KEY` → your Supabase service_role key
4. Deploy

## ISB GenAI Assignment — Naman Bhatt (62610687)

## Repo layout
- `index.html` — landing page + live "try it" feature
- `api/process.js`, `api/stats.js` — Vercel serverless functions
- `supabase_setup.sql` — table schema
- `brand-intel/` — Task 5: boAt Lifestyle YouTube comment sentiment analysis (data, scripts, charts)
