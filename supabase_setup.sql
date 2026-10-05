-- Run this in Supabase SQL Editor to create the table
CREATE TABLE kaamqueue_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  visitor_id TEXT,
  shop_type TEXT,
  language_detected TEXT,
  request_type TEXT,
  input_text TEXT,
  output_json TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0
);

-- Enable Row Level Security with no policies: the anon/public key gets no access,
-- while the service_role key (used only server-side in /api) bypasses RLS.
ALTER TABLE kaamqueue_logs ENABLE ROW LEVEL SECURITY;
