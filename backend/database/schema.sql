-- Helix Database Schema
-- PostgreSQL database for MSP lead management and outreach tracking

CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    business_name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    city TEXT,
    state TEXT DEFAULT 'NY',
    zip TEXT,
    phone TEXT,
    website TEXT,
    google_rating REAL,
    review_count INTEGER DEFAULT 0,
    place_id TEXT UNIQUE,
    owner_name TEXT,
    pipeline_stage TEXT DEFAULT 'new' CHECK(pipeline_stage IN ('new', 'outreach_sent', 'responded', 'discovery_call', 'technical_review', 'contract_sent', 'onboarding', 'live', 'dead')),
    lead_score INTEGER DEFAULT 0,
    contact_attempts INTEGER DEFAULT 0,
    last_contact_date TEXT,
    last_contact_method TEXT CHECK(last_contact_method IN ('call', 'email', 'none') OR last_contact_method IS NULL),
    notes TEXT,
    -- Apollo enrichment columns
    email VARCHAR(255),
    contact_name VARCHAR(255),
    contact_title VARCHAR(255),
    direct_phone VARCHAR(50),
    apollo_id VARCHAR(255),
    enriched_at TIMESTAMP,
    instantly_campaign_id VARCHAR(255),
    last_email_at TIMESTAMP,
    -- Helix MSP-specific columns
    estimated_locations INTEGER,
    hardware_vendors TEXT,
    manages_wifi BOOLEAN DEFAULT false,
    geographic_reach VARCHAR(100),
    company_size VARCHAR(50),
    discovery_score INTEGER DEFAULT 0,
    compatible_hardware BOOLEAN,
    deployment_timeline VARCHAR(100),
    apollo_sequence_id VARCHAR(255),
    email_status VARCHAR(50) DEFAULT 'none',
    auto_score INTEGER DEFAULT 0,
    decision_maker_engaged BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreach_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('call', 'email')),
    status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'approved', 'rejected', 'fired', 'completed', 'failed')),
    scheduled_time TEXT,
    approved_at TEXT,
    completed_at TEXT,
    result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS call_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    retell_call_id TEXT,
    duration_seconds INTEGER DEFAULT 0,
    outcome TEXT CHECK(outcome IN ('interested', 'not_interested', 'voicemail', 'no_answer', 'callback', 'wrong_number')),
    transcript TEXT,
    recording_url TEXT,
    cost REAL DEFAULT 0,
    callback_time TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    instantly_message_id TEXT,
    sequence_name TEXT,
    step_number INTEGER,
    status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'opened', 'replied', 'bounced')),
    sent_at TEXT,
    opened_at TEXT,
    replied_at TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    audio_path TEXT,
    duration_seconds INTEGER DEFAULT 0,
    transcript TEXT,
    ai_summary TEXT,
    ai_objections TEXT,
    ai_sentiment TEXT,
    ai_outcome TEXT,
    ai_pitch_feedback TEXT,
    ai_score INTEGER,
    ai_key_info TEXT,
    ai_auto_update TEXT,
    status TEXT DEFAULT 'uploading' CHECK(status IN ('uploading', 'transcribing', 'analyzing', 'complete', 'error')),
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON leads(place_id);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_status ON outreach_queue(status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_lead_id ON outreach_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_log_lead_id ON call_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_log_lead_id ON email_log(lead_id);

CREATE INDEX IF NOT EXISTS idx_recordings_lead_id ON recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);

CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER,
    recording_id INTEGER,
    event_type TEXT NOT NULL CHECK(event_type IN ('callback', 'site_visit', 'follow_up_email', 'follow_up_call', 'custom')),
    title TEXT NOT NULL,
    description TEXT,
    event_date TEXT NOT NULL,
    event_time TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 15,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
    auto_created INTEGER DEFAULT 0,
    google_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead_id ON calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);

-- Note: updated_at is managed in application code on each UPDATE to leads
