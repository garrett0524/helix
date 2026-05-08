/**
 * TesseraFlow SQLite -> PostgreSQL Migration Script
 *
 * Reads the existing SQLite database and copies all data to PostgreSQL.
 * Run once: node backend/database/migrate.js
 *
 * Prerequisites:
 *   - PostgreSQL tables must already exist (run seed.js first)
 *   - SQLite database file must exist at data/tesseraflow.db
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tesseraflow.db');

async function migrate() {
  // Check SQLite file exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite database not found at: ${DB_PATH}`);
    console.log('Nothing to migrate. If this is a fresh install, just run seed.js.');
    process.exit(0);
  }

  // Load sql.js for reading the SQLite database
  let SQL;
  try {
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
  } catch (err) {
    console.error('sql.js not available. Install it: npm install sql.js');
    console.log('If sql.js has been removed, you can temporarily install it: npm install sql.js');
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(DB_PATH);
  const sqliteDb = new SQL.Database(fileBuffer);

  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pgPool.connect();

  try {
    console.log('Starting SQLite -> PostgreSQL migration...');
    console.log(`Source: ${DB_PATH}`);
    console.log(`Target: ${process.env.DATABASE_URL ? '(from DATABASE_URL)' : 'default'}`);
    console.log('');

    // Helper to read all rows from SQLite
    function sqliteAll(sql) {
      try {
        const stmt = sqliteDb.prepare(sql);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      } catch (err) {
        console.warn(`SQLite query warning: ${err.message}`);
        return [];
      }
    }

    // Migrate tables in order (respecting foreign keys)
    const tables = [
      {
        name: 'settings',
        query: 'SELECT * FROM settings',
        insert: 'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3',
        map: (row) => [row.key, row.value, row.updated_at || new Date().toISOString()],
      },
      {
        name: 'leads',
        query: 'SELECT * FROM leads ORDER BY id',
        insert: `INSERT INTO leads (id, business_name, category, address, city, state, zip, phone, website,
                  google_rating, review_count, place_id, owner_name, pipeline_stage, lead_score,
                  contact_attempts, last_contact_date, last_contact_method, notes, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
                 ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.business_name, row.category, row.address, row.city, row.state, row.zip,
          row.phone, row.website, row.google_rating, row.review_count, row.place_id, row.owner_name,
          row.pipeline_stage, row.lead_score, row.contact_attempts, row.last_contact_date,
          row.last_contact_method, row.notes, row.created_at, row.updated_at,
        ],
        postMigrate: async () => {
          // Reset sequence to max id
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM leads');
          await client.query(`ALTER SEQUENCE leads_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
      {
        name: 'outreach_queue',
        query: 'SELECT * FROM outreach_queue ORDER BY id',
        insert: `INSERT INTO outreach_queue (id, lead_id, action_type, status, scheduled_time, approved_at, completed_at, result, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.lead_id, row.action_type, row.status, row.scheduled_time,
          row.approved_at, row.completed_at, row.result, row.created_at,
        ],
        postMigrate: async () => {
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM outreach_queue');
          await client.query(`ALTER SEQUENCE outreach_queue_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
      {
        name: 'call_log',
        query: 'SELECT * FROM call_log ORDER BY id',
        insert: `INSERT INTO call_log (id, lead_id, retell_call_id, duration_seconds, outcome, transcript, recording_url, cost, callback_time, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.lead_id, row.retell_call_id, row.duration_seconds, row.outcome,
          row.transcript, row.recording_url, row.cost, row.callback_time, row.created_at,
        ],
        postMigrate: async () => {
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM call_log');
          await client.query(`ALTER SEQUENCE call_log_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
      {
        name: 'email_log',
        query: 'SELECT * FROM email_log ORDER BY id',
        insert: `INSERT INTO email_log (id, lead_id, instantly_message_id, sequence_name, step_number, status, sent_at, opened_at, replied_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.lead_id, row.instantly_message_id, row.sequence_name, row.step_number,
          row.status, row.sent_at, row.opened_at, row.replied_at,
        ],
        postMigrate: async () => {
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM email_log');
          await client.query(`ALTER SEQUENCE email_log_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
      {
        name: 'recordings',
        query: 'SELECT * FROM recordings ORDER BY id',
        insert: `INSERT INTO recordings (id, lead_id, audio_path, duration_seconds, transcript, ai_summary,
                  ai_objections, ai_sentiment, ai_outcome, ai_pitch_feedback, ai_score, ai_key_info,
                  ai_auto_update, status, error_message, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.lead_id, row.audio_path, row.duration_seconds, row.transcript, row.ai_summary,
          row.ai_objections, row.ai_sentiment, row.ai_outcome, row.ai_pitch_feedback, row.ai_score,
          row.ai_key_info, row.ai_auto_update, row.status, row.error_message, row.created_at,
        ],
        postMigrate: async () => {
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM recordings');
          await client.query(`ALTER SEQUENCE recordings_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
      {
        name: 'calendar_events',
        query: 'SELECT * FROM calendar_events ORDER BY id',
        insert: `INSERT INTO calendar_events (id, lead_id, recording_id, event_type, title, description,
                  event_date, event_time, duration_minutes, status, auto_created, google_event_id, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        map: (row) => [
          row.id, row.lead_id, row.recording_id, row.event_type, row.title, row.description,
          row.event_date, row.event_time, row.duration_minutes, row.status,
          row.auto_created === 1 || row.auto_created === true,
          row.google_event_id, row.created_at, row.updated_at,
        ],
        postMigrate: async () => {
          const { rows } = await client.query('SELECT COALESCE(MAX(id), 0) + 1 as next FROM calendar_events');
          await client.query(`ALTER SEQUENCE calendar_events_id_seq RESTART WITH ${rows[0].next}`);
        },
      },
    ];

    for (const table of tables) {
      const rows = sqliteAll(table.query);
      console.log(`Migrating ${table.name}: ${rows.length} rows`);

      let migrated = 0;
      let skipped = 0;

      for (const row of rows) {
        try {
          const params = table.map(row);
          await client.query(table.insert, params);
          migrated++;
        } catch (err) {
          if (err.message.includes('duplicate') || err.message.includes('already exists')) {
            skipped++;
          } else {
            console.warn(`  Warning migrating ${table.name} row: ${err.message}`);
            skipped++;
          }
        }
      }

      if (table.postMigrate) {
        await table.postMigrate();
      }

      console.log(`  -> Migrated: ${migrated}, Skipped: ${skipped}`);
    }

    console.log('');
    console.log('Migration complete!');

    // Print row counts for verification
    console.log('');
    console.log('PostgreSQL row counts:');
    for (const table of tables) {
      const { rows } = await client.query(`SELECT COUNT(*) as count FROM ${table.name}`);
      console.log(`  ${table.name}: ${rows[0].count}`);
    }

  } catch (err) {
    console.error('Migration error:', err.message);
    throw err;
  } finally {
    sqliteDb.close();
    client.release();
    await pgPool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
