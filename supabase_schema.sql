-- ============================================
-- ZERO-AI TELEGRAM BOT — SUPABASE SCHEMA
-- ============================================

-- 1. Messages table: stores conversation history per user
CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_user_id ON messages (user_id);
CREATE INDEX idx_messages_created_at ON messages (user_id, created_at DESC);

-- 2. User mode table: persists selected AI mode per user
CREATE TABLE IF NOT EXISTS user_modes (
  user_id        BIGINT PRIMARY KEY,
  selected_mode  TEXT NOT NULL DEFAULT 'fast' CHECK (selected_mode IN ('fast', 'thinker')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Pagination state: tracks page position per message
CREATE TABLE IF NOT EXISTS pagination_state (
  message_id     BIGINT NOT NULL,
  chat_id        BIGINT NOT NULL,
  user_id        BIGINT NOT NULL,
  pages          JSONB NOT NULL,       -- array of page content strings
  current_page   INT NOT NULL DEFAULT 0,
  total_pages    INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);

CREATE INDEX idx_pagination_user ON pagination_state (user_id);

-- 4. Temporary file storage for PDF Q&A
CREATE TABLE IF NOT EXISTS user_files (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  file_name   TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_files_user ON user_files (user_id);

-- 5. Row Level Security (optional, recommended for production)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagination_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;

-- Policies: allow all operations via service role / anon key
-- Adjust these for your security needs
CREATE POLICY "Allow all on messages" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_modes" ON user_modes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on pagination_state" ON pagination_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_files" ON user_files FOR ALL USING (true) WITH CHECK (true);
