/**
 * TesseraFlow Database Seed Script
 *
 * Creates all tables if they don't exist and seeds the default admin user.
 * Safe to run multiple times (idempotent).
 *
 * Usage: node backend/database/seed.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Running TesseraFlow database seed...');

    // Create all tables
    await client.query(`
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
        pipeline_stage TEXT DEFAULT 'new' CHECK(pipeline_stage IN ('new', 'contacted', 'interested', 'meeting_booked', 'closed', 'dead')),
        lead_score INTEGER DEFAULT 0,
        contact_attempts INTEGER DEFAULT 0,
        last_contact_date TEXT,
        last_contact_method TEXT CHECK(last_contact_method IN ('call', 'email', 'none') OR last_contact_method IS NULL),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outreach_queue (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL CHECK(action_type IN ('call', 'email')),
        status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'approved', 'rejected', 'fired', 'completed', 'failed')),
        scheduled_time TEXT,
        approved_at TEXT,
        completed_at TEXT,
        result TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS call_log (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        retell_call_id TEXT,
        duration_seconds INTEGER DEFAULT 0,
        outcome TEXT CHECK(outcome IN ('interested', 'not_interested', 'voicemail', 'no_answer', 'callback', 'wrong_number')),
        transcript TEXT,
        recording_url TEXT,
        cost REAL DEFAULT 0,
        callback_time TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_log (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        instantly_message_id TEXT,
        sequence_name TEXT,
        step_number INTEGER,
        status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'opened', 'replied', 'bounced')),
        sent_at TEXT,
        opened_at TEXT,
        replied_at TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS recordings (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER,
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
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        recording_id INTEGER REFERENCES recordings(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('callback', 'site_visit', 'follow_up_email', 'follow_up_call', 'custom')),
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        event_time TEXT NOT NULL,
        duration_minutes INTEGER DEFAULT 15,
        status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
        auto_created BOOLEAN DEFAULT false,
        google_event_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
        avatar_color TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes (IF NOT EXISTS supported in PostgreSQL 9.5+)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage)',
      'CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category)',
      'CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON leads(lead_score)',
      'CREATE INDEX IF NOT EXISTS idx_leads_place_id ON leads(place_id)',
      'CREATE INDEX IF NOT EXISTS idx_outreach_queue_status ON outreach_queue(status)',
      'CREATE INDEX IF NOT EXISTS idx_outreach_queue_lead_id ON outreach_queue(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_call_log_lead_id ON call_log(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_email_log_lead_id ON email_log(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_recordings_lead_id ON recordings(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status)',
      'CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_calendar_events_event_date ON calendar_events(event_date)',
      'CREATE INDEX IF NOT EXISTS idx_calendar_events_lead_id ON calendar_events(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)',
    ];

    for (const idx of indexes) {
      await client.query(idx);
    }

    // Add user_id column to recordings if missing (migration for existing tables)
    try {
      await client.query('ALTER TABLE recordings ADD COLUMN IF NOT EXISTS user_id INTEGER');
    } catch (e) {
      // Column may already exist
    }

    // Apollo enrichment & email campaign columns on leads table
    const apolloMigrations = [
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS email VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_title VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS direct_phone VARCHAR(50)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_id VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP',
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status VARCHAR(50) DEFAULT 'none'",
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS instantly_campaign_id VARCHAR(255)',
      'ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_email_at TIMESTAMP',
    ];
    for (const migration of apolloMigrations) {
      try {
        await client.query(migration);
      } catch (e) {
        // Column may already exist
      }
    }
    console.log('Apollo/email columns migration complete.');

    // Seed default admin user if no users exist
    const { rows: existingUsers } = await client.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(existingUsers[0].count) === 0) {
      const passwordHash = await bcrypt.hash('changeme123', 12);
      const avatarColor = '#6366f1'; // Indigo

      await client.query(
        `INSERT INTO users (username, password_hash, name, role, avatar_color)
         VALUES ($1, $2, $3, $4, $5)`,
        ['garrett', passwordHash, 'Garrett', 'admin', avatarColor]
      );

      console.log('');
      console.log('========================================');
      console.log('  DEFAULT ADMIN ACCOUNT CREATED');
      console.log('  Username: garrett');
      console.log('  Password: changeme123');
      console.log('  PLEASE CHANGE THIS PASSWORD!');
      console.log('========================================');
      console.log('');
    } else {
      console.log('Users already exist, skipping default admin creation.');
    }

    // Seed default settings if settings table is empty
    const { rows: existingSettings } = await client.query('SELECT COUNT(*) as count FROM settings');
    if (parseInt(existingSettings[0].count) === 0) {
      const defaultSettings = [
        ['retell_api_key', ''],
        ['retell_voice_id', ''],
        ['instantly_api_key', ''],
        ['scraper_default_radius', '10'],
        ['scraper_default_geography', 'Long Island, NY'],
        ['scraper_categories', 'bars,restaurants,gyms,fitness centers'],
        ['notification_email', ''],
        ['notification_sms', ''],
        ['anthropic_api_key', ''],
        ['anthropic_model', 'haiku'],
        ['whisper_model_size', 'base'],
        ['auto_apply_ai_suggestions', 'false'],
        ['google_client_id', ''],
        ['google_client_secret', ''],
        ['google_refresh_token', ''],
        ['google_calendar_id', 'primary'],
        ['apollo_api_key', ''],
      ];

      for (const [key, value] of defaultSettings) {
        await client.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
          [key, value]
        );
      }
      console.log('Default settings seeded.');
    }

    console.log('Database seed complete!');
  } catch (err) {
    console.error('Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
