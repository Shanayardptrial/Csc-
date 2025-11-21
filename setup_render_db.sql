-- Run this SQL in Render PostgreSQL Console after creating the database

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  operator_id INTEGER,
  status TEXT DEFAULT 'pending_payment',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  payment_id TEXT,
  amount INTEGER DEFAULT 5000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
