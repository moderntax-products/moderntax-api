-- IRS PPS Full Workflow - Extended Schema
-- Run AFTER 001_pps_call_tracking.sql

-- ============================================
-- Table: pps_experts
-- Tax practitioners (like Tanya) who make PPS calls
-- ============================================
CREATE TABLE IF NOT EXISTS pps_experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,                     -- Phone to route IRS callbacks to
  ptin TEXT,                               -- Their PTIN if they have one
  caf_number TEXT,

  -- Availability
  timezone TEXT DEFAULT 'America/Los_Angeles',
  available_start TIME DEFAULT '09:00',    -- Local time start (e.g., 9am PT for Tanya)
  available_end TIME DEFAULT '14:00',      -- Local time end (e.g., 2pm PT for Tanya)
  available_days INTEGER[] DEFAULT '{1,2,3,4,5}',  -- 0=Sun..6=Sat
  max_calls_per_day INTEGER DEFAULT 3,
  max_requests_per_call INTEGER DEFAULT 5,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  current_call_id UUID REFERENCES pps_calls(id),
  calls_today INTEGER DEFAULT 0,

  -- Billing
  hourly_rate NUMERIC(10,2),
  pay_schedule TEXT DEFAULT 'biweekly',    -- biweekly, monthly

  -- Metrics
  total_calls INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  avg_requests_per_call NUMERIC(4,2) DEFAULT 0,
  efficiency_rate NUMERIC(5,2) DEFAULT 0,  -- % of requests completed successfully

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_lender_clients
-- The SBA lenders (Centerstone, etc.) who send us requests
-- ============================================
CREATE TABLE IF NOT EXISTS pps_lender_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                      -- e.g., "Centerstone"
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,

  -- Notification preferences
  webhook_url TEXT,                        -- For real-time notifications
  notification_email TEXT,                 -- Email notifications
  notification_method TEXT DEFAULT 'email', -- email, webhook, both

  -- Tracking
  total_requests INTEGER DEFAULT 0,
  avg_turnaround_hours NUMERIC(8,2),

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_transcript_requests
-- Individual transcript requests from lenders
-- This is the master request table — links to calls via assignments
-- ============================================
CREATE TABLE IF NOT EXISTS pps_transcript_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  lender_client_id UUID REFERENCES pps_lender_clients(id),
  loan_id TEXT,                            -- Lender's loan reference number

  -- Business/entity info
  business_name TEXT NOT NULL,
  ein TEXT NOT NULL,                        -- Stored plaintext for matching (encrypted in pps_clients)
  entity_type TEXT,                         -- s_corp, c_corp, llc, partnership, sole_prop, schedule_c

  -- Owner/individual info (if individual request)
  individual_name TEXT,
  ssn_last4 TEXT,
  request_type TEXT DEFAULT 'business',     -- business, individual

  -- What's needed
  form_types TEXT[] NOT NULL,               -- {'1120S', '1065', '1040', '941'}
  transcript_types TEXT[] NOT NULL,         -- {'record_of_account', 'tax_return', 'entity', 'wage_income'}
  tax_years TEXT[] NOT NULL,                -- {'2022', '2023', '2024'}
  quarters TEXT[],                          -- For 941/940: {'Q1', 'Q2', 'Q3', 'Q4'}
  include_entity_transcript BOOLEAN DEFAULT TRUE,

  -- 8821 form info
  auth_form_type TEXT DEFAULT '8821',
  auth_form_url TEXT,                       -- URL to the signed 8821 PDF
  form_column_a TEXT DEFAULT 'Income',      -- Type of Tax Information (Income, Employment, Payroll)

  -- Assignment
  assigned_expert_id UUID REFERENCES pps_experts(id),
  assigned_call_id UUID REFERENCES pps_calls(id),
  assigned_at TIMESTAMPTZ,
  batch_id TEXT,                            -- Group requests into batches for a single call
  request_order INTEGER DEFAULT 0,          -- Order within the batch

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending: waiting to be assigned
  -- assigned: assigned to expert, waiting for call
  -- in_progress: currently being requested on a call
  -- requested: requested on call, waiting for SOR delivery
  -- downloaded: transcripts downloaded from SOR
  -- uploaded: transcripts uploaded to our system
  -- screened: compliance screening complete
  -- delivered: sent to lender client
  -- failed: request failed
  -- rejected: IRS rejected the request

  -- IRS interaction
  irs_confirmation TEXT,
  delivery_method TEXT DEFAULT 'sor_inbox',  -- sor_inbox, fax, mail, tds
  rejection_reason TEXT,

  -- Priority
  priority TEXT DEFAULT 'normal',           -- urgent, normal, low
  due_date DATE,

  -- Metadata
  notes TEXT,
  lender_notes TEXT,                        -- Notes from the lender

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_transcripts
-- Actual transcript files downloaded from SOR
-- Replaces Dropbox — stores in Supabase Storage or as parsed data
-- ============================================
CREATE TABLE IF NOT EXISTS pps_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES pps_transcript_requests(id) ON DELETE CASCADE,

  -- File identity
  filename TEXT NOT NULL,
  file_url TEXT,                            -- Supabase Storage URL or external URL
  file_type TEXT DEFAULT 'pdf',             -- pdf, html
  file_size_bytes INTEGER,

  -- Parsed metadata
  business_name TEXT,
  tin TEXT,
  form_type TEXT,                           -- 1120S, 1065, 1040, etc.
  transcript_type TEXT,                     -- record_of_account, tax_return, entity, wage_income
  tax_year TEXT,
  tax_period TEXT,

  -- Compliance screening results (from irs-batch-v5.js engine)
  severity TEXT DEFAULT 'CLEAN',            -- CLEAN, INFO, WARNING, CRITICAL
  compliance_flags JSONB DEFAULT '[]'::jsonb,

  -- Financial data extracted
  gross_receipts NUMERIC(15,2),
  total_income NUMERIC(15,2),
  total_deductions NUMERIC(15,2),
  ordinary_income NUMERIC(15,2),
  total_assets NUMERIC(15,2),
  total_tax NUMERIC(15,2),
  balance_due NUMERIC(15,2),
  account_balance NUMERIC(15,2),
  accrued_interest NUMERIC(15,2),
  accrued_penalty NUMERIC(15,2),
  account_balance_plus_accruals NUMERIC(15,2),

  -- Transaction codes (for account transcripts)
  transaction_codes JSONB DEFAULT '[]'::jsonb,

  -- Raw content
  raw_html TEXT,                            -- Original HTML from IRS
  parsed_data JSONB DEFAULT '{}'::jsonb,    -- Full parsed structure

  -- Status
  is_no_record BOOLEAN DEFAULT FALSE,       -- "No Record of Return Filed"

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_compliance_reports
-- Generated compliance screening reports
-- ============================================
CREATE TABLE IF NOT EXISTS pps_compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What this report covers
  call_id UUID REFERENCES pps_calls(id),
  batch_id TEXT,                            -- If generated for a batch

  -- Report content
  report_html TEXT,
  report_url TEXT,                          -- Supabase Storage URL

  -- Summary stats
  total_transcripts INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  clean_count INTEGER DEFAULT 0,
  total_balance_due NUMERIC(15,2) DEFAULT 0,

  -- Transcript IDs included
  transcript_ids UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_notifications
-- Client notifications sent when transcripts are ready
-- ============================================
CREATE TABLE IF NOT EXISTS pps_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What triggered the notification
  request_id UUID REFERENCES pps_transcript_requests(id),
  lender_client_id UUID REFERENCES pps_lender_clients(id),

  -- Notification details
  type TEXT NOT NULL,                       -- transcript_ready, compliance_alert, batch_complete
  channel TEXT NOT NULL,                    -- email, webhook, slack
  recipient TEXT NOT NULL,                  -- Email address or webhook URL

  -- Content
  subject TEXT,
  body TEXT,
  payload JSONB DEFAULT '{}'::jsonb,        -- For webhook notifications

  -- Status
  status TEXT DEFAULT 'pending',            -- pending, sent, failed
  sent_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: pps_expert_timesheets
-- Track expert hours and billing
-- ============================================
CREATE TABLE IF NOT EXISTS pps_expert_timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id UUID NOT NULL REFERENCES pps_experts(id),
  call_id UUID REFERENCES pps_calls(id),

  -- Time
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes NUMERIC(6,2),

  -- Work details
  requests_completed INTEGER DEFAULT 0,
  requests_attempted INTEGER DEFAULT 0,

  -- Billing
  billing_period TEXT,                      -- e.g., "2026-02-12 to 2026-03-11"
  amount NUMERIC(10,2),
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Add expert_id to pps_calls
-- ============================================
ALTER TABLE pps_calls ADD COLUMN IF NOT EXISTS expert_id UUID REFERENCES pps_experts(id);
ALTER TABLE pps_calls ADD COLUMN IF NOT EXISTS batch_id TEXT;

-- ============================================
-- Add new indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pps_transcript_requests_status ON pps_transcript_requests(status);
CREATE INDEX IF NOT EXISTS idx_pps_transcript_requests_lender ON pps_transcript_requests(lender_client_id);
CREATE INDEX IF NOT EXISTS idx_pps_transcript_requests_expert ON pps_transcript_requests(assigned_expert_id);
CREATE INDEX IF NOT EXISTS idx_pps_transcript_requests_ein ON pps_transcript_requests(ein);
CREATE INDEX IF NOT EXISTS idx_pps_transcript_requests_batch ON pps_transcript_requests(batch_id);

CREATE INDEX IF NOT EXISTS idx_pps_transcripts_request_id ON pps_transcripts(request_id);
CREATE INDEX IF NOT EXISTS idx_pps_transcripts_severity ON pps_transcripts(severity);

CREATE INDEX IF NOT EXISTS idx_pps_notifications_request ON pps_notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_pps_notifications_status ON pps_notifications(status);

CREATE INDEX IF NOT EXISTS idx_pps_expert_timesheets_expert ON pps_expert_timesheets(expert_id);
CREATE INDEX IF NOT EXISTS idx_pps_expert_timesheets_date ON pps_expert_timesheets(date);

CREATE INDEX IF NOT EXISTS idx_pps_calls_expert ON pps_calls(expert_id);
CREATE INDEX IF NOT EXISTS idx_pps_calls_batch ON pps_calls(batch_id);

-- ============================================
-- RLS policies for new tables
-- ============================================
ALTER TABLE pps_experts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_lender_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_transcript_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pps_expert_timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pps_experts" ON pps_experts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_lender_clients" ON pps_lender_clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_transcript_requests" ON pps_transcript_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_transcripts" ON pps_transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_compliance_reports" ON pps_compliance_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_notifications" ON pps_notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on pps_expert_timesheets" ON pps_expert_timesheets FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- Updated_at triggers for new tables
-- ============================================
CREATE TRIGGER update_pps_experts_updated_at
  BEFORE UPDATE ON pps_experts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pps_lender_clients_updated_at
  BEFORE UPDATE ON pps_lender_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pps_transcript_requests_updated_at
  BEFORE UPDATE ON pps_transcript_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
