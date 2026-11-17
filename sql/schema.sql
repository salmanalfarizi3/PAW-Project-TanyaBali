-- Skema PostgreSQL untuk proyek TanyaBali (sesuai driver pg pada repository saat ini).
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Struktur tabel produk yang digunakan oleh model dan fitur chatbot.
CREATE TABLE IF NOT EXISTS produk (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Penyesuaian ringan jika tabel produk versi lama memakai nama kolom Indonesia.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='nama')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='name') THEN
    ALTER TABLE produk RENAME COLUMN nama TO name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='harga')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='price') THEN
    ALTER TABLE produk RENAME COLUMN harga TO price;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='deskripsi')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produk' AND column_name='description') THEN
    ALTER TABLE produk RENAME COLUMN deskripsi TO description;
  END IF;
END $$;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT 'Bali';
ALTER TABLE produk ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE produk ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_produk_name ON produk (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_produk_category ON produk (LOWER(category));

-- Contoh data awal sesuai kebutuhan PRD; silakan verifikasi dan lengkapi informasi sebelum dipakai.
INSERT INTO produk(name,category,price,description)
SELECT 'Pura Tanah Lot','Kabupaten Tabanan',0,'Objek wisata pura di kawasan pesisir Tabanan.'
WHERE NOT EXISTS (SELECT 1 FROM produk WHERE LOWER(name)=LOWER('Pura Tanah Lot'));
INSERT INTO produk(name,category,price,description)
SELECT 'Pantai Kuta','Kabupaten Badung',0,'Pantai populer di kawasan Kuta, Kabupaten Badung.'
WHERE NOT EXISTS (SELECT 1 FROM produk WHERE LOWER(name)=LOWER('Pantai Kuta'));
INSERT INTO produk(name,category,price,description)
SELECT 'Sayur Srombotan','Kuliner Kabupaten Klungkung',0,'Kuliner khas Klungkung berbahan sayuran dengan bumbu khas.'
WHERE NOT EXISTS (SELECT 1 FROM produk WHERE LOWER(name)=LOWER('Sayur Srombotan'));

-- Riwayat percakapan chatbot: setiap pengguna hanya dapat mengakses percakapannya sendiri.
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL DEFAULT 'Percakapan baru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  source VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated
  ON chat_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON chat_messages (conversation_id, created_at ASC);
