-- IRS PPS Call Automation - Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- Table: pps_calls
-- Core call tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS pps_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Call metadata
  call_sid TEXT UNIQUE,                    -- Twilio Call SID
  status TEXT NOT NULL DEFAULT 'queued',   -- queued, dialing, in_progress, on_hold, completed, failed, cancelled
  direction TEXT DEFAULT 'outbound',       -- outbound (we call IRS) or callback

  -- Phone numbers
  from_number TEXT NOT NULL,               -- Which of our 2 rotating numbers was used
  to_number TEXT DEFAULT '+18005829876',   -- IRS PPS number
  callback_number TEXT,                    -- Number IRS should call back on

  -- IRS agent info (extracted from conversation)
  irs_agent_name TEXT,
  irs_agent_id TEXT,

  -- Practitioner info
  practitioner_name TEXT DEFAULT 'Matt',
  practitioner_ptin TEXT DEFAULT 'P01809554',
  practitioner_caf TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  connected_at TIMESTAMPTZ,               -- When IRS agent picked up
  ended_at TIMESTAMPTZ,
  hold_duration_seconds INTEGER DEFAULT 0,
  active_duration_seconds INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,

  -- Recording
  recording_url TEXT,
  recording_sid TEXT,

  -- Transcription
  full_transcript TEXT,
  transcript_segments JSONB DEFAULT '[]'::jsonb,  -- Array of {speaker, text, timestamp}

  -- AI analysis
  ai_summary TEXT,
  ai_extracted_data JSONB DEFAULT '{}'::jsonb,

  -- Fax tracking
  fax_sent BOOLEAN DEFAULT FALSE,
  fax_number TEXT DEFAULT '415-900-4436',
  fax_confirmed BOOLEAN DEFAULT FALSE,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_call_requests
-- Individual transcript requests within a call
-- (One call can handle multiple clients/EINs)
-- ============================================
CREATE TABLE IF NOT EXISTS pps_call_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES pps_calls(id) ON DELETE CASCADE,

  -- Client / Business info
  client_name TEXT,
  business_name TEXT NOT NULL,
  ein TEXT NOT NULL,
  entity_type TEXT,                        -- s_corp, c_corp, llc, partnership, sole_prop

  -- What was requested
  form_types TEXT[] NOT NULL,              -- {'1120S', '1065', '941', '940', '1099', 'W-2'}
  transcript_types TEXT[] NOT NULL,        -- {'tax_return', 'account', 'wage_income', 'record_of_account'}
  tax_years TEXT[] NOT NULL,               -- {'2021', '2022', '2023'}
  quarters TEXT[],                         -- For 941/940: {'Q1', 'Q2', 'Q3', 'Q4'}

  -- Authorization
  auth_form_type TEXT DEFAULT '8821',      -- 8821 or 2848
  auth_form_faxed BOOLEAN DEFAULT FALSE,
  auth_form_confirmed BOOLEAN DEFAULT FALSE,

  -- Result
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, in_progress, approved, sent, failed, rejected
  delivery_method TEXT,                    -- sor_inbox, fax, mail
  transcripts_received BOOLEAN DEFAULT FALSE,

  -- IRS response details
  irs_confirmation TEXT,                   -- Any confirmation number or details
  rejection_reason TEXT,                   -- If rejected, why

  -- Ordering within the call
  request_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_transcript_segments
-- Real-time transcript segments for live view
-- ============================================
CREATE TABLE IF NOT EXISTS pps_transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES pps_calls(id) ON DELETE CASCADE,

  speaker TEXT NOT NULL,                   -- 'practitioner', 'irs_agent', 'unknown'
  text TEXT NOT NULL,
  confidence REAL,                         -- Transcription confidence 0-1

  timestamp_ms INTEGER NOT NULL,           -- Milliseconds from call start
  duration_ms INTEGER,

  -- AI annotations on this segment
  ai_intent TEXT,                          -- e.g. 'identity_verification', 'ein_provided', 'transcript_request', 'hold', 'confirmation'
  ai_extracted JSONB,                      -- Structured data extracted from this segment

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_callback_numbers
-- Rotating callback numbers management
-- ============================================
CREATE TABLE IF NOT EXISTS pps_callback_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  twilio_sid TEXT,                         -- Twilio phone number SID
  label TEXT,                              -- e.g. 'Line 1', 'Line 2'
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  total_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_clients
-- Client/business master list for quick lookup
-- ============================================
CREATE TABLE IF NOT EXISTS pps_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  ein_encrypted TEXT NOT NULL,             -- Encrypted EIN using AES-256-CBC
  entity_type TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Authorization status
  has_8821 BOOLEAN DEFAULT FALSE,
  has_2848 BOOLEAN DEFAULT FALSE,
  auth_expiry DATE,

  -- Tracking
  last_request_at TIMESTAMPTZ,
  total_requests INTEGER DEFAULT 0,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pps_calls_status ON pps_calls(status);
CREATE INDEX IF NOT EXISTS idx_pps_calls_started_at ON pps_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pps_calls_call_sid ON pps_calls(call_sid);

CREATE INDEX IF NOT EXISTS idx_pps_call_requests_call_id ON pps_call_requests(call_id);
CREATE INDEX IF NOT EXISTS idx_pps_call_requests_ein ON pps_call_requests(ein);
CREATE INDEX IF NOT EXISTS idx_pps_call_requests_status ON pps_call_requests(status);

CREATE INDEX IF NOT EXISTS idx_pps_transcript_segments_call_id ON pps_transcript_segments(call_id);
CREATE INDEX IF NOT EXISTS idx_pps_transcript_segments_timestamp ON pps_transcript_segments(call_id, timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_pps_clients_business_name ON pps_clients(business_name);

-- ============================================
-- Updated_at triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pps_calls_updated_at
  BEFORE UPDATE ON pps_calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pps_call_requests_updated_at
  BEFORE UPDATE ON pps_call_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pps_clients_updated_at
  BEFORE UPDATE ON pps_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Enable RLS (Row Level Security)
-- ============================================
ALTER TABLE pps_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_callback_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_clients ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on pps_calls" ON pps_calls
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_call_requests" ON pps_call_requests
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_transcript_segments" ON pps_transcript_segments
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_callback_numbers" ON pps_callback_numbers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_clients" ON pps_clients
  FOR ALL USING (true) WITH CHECK (true);
