/**
 * Helix Idempotent Postgres Migration Runner
 *
 * Applies schema changes to an existing Postgres database without
 * losing data. Re-runnable: every step uses IF NOT EXISTS / IF EXISTS
 * guards so a second invocation is a no-op.
 *
 * Usage: node backend/database/migrate.js
 *
 * Currently applies (in order):
 *   1. TASK-05: Add MSP columns to leads
 *   2. TASK-06: Migrate pipeline_stage enum to MSP-specific stages
 *   3. TASK-07: Strip deprecated Instantly/Retell/scraper settings rows
 *   4. TASK-08-11: Drop deprecated tables (outreach_queue, call_log, email_log)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');

const NEW_PIPELINE_STAGES = [
  'new',
  'outreach_sent',
  'responded',
  'discovery_call',
  'technical_review',
  'contract_sent',
  'onboarding',
  'live',
  'dead',
];

// Old -> new stage mapping for any rows still on the legacy enum.
const STAGE_REMAP = {
  contacted: 'outreach_sent',
  interested: 'responded',
  meeting_booked: 'discovery_call',
  closed: 'live',
};

// Settings rows that should be removed (deprecated integrations).
const DEPRECATED_SETTINGS_KEYS = [
  'instantly_api_key',
  'retell_api_key',
  'retell_voice_id',
  'scraper_default_radius',
  'scraper_default_geography',
  'scraper_categories',
];

async function migrateMspColumns(client) {
  console.log('TASK-05: Adding MSP columns to leads...');

  const columnMigrations = [
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_locations INTEGER',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS hardware_vendors TEXT',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS manages_wifi BOOLEAN DEFAULT false',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS geographic_reach VARCHAR(100)',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_size VARCHAR(50)',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS discovery_score INTEGER DEFAULT 0',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS compatible_hardware BOOLEAN',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS deployment_timeline VARCHAR(100)',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS apollo_sequence_id VARCHAR(255)',
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status VARCHAR(50) DEFAULT 'none'",
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_score INTEGER DEFAULT 0',
    'ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker_engaged BOOLEAN DEFAULT false',
  ];

  for (const sql of columnMigrations) {
    await client.query(sql);
  }

  console.log(`  -> Applied ${columnMigrations.length} ADD COLUMN IF NOT EXISTS statements.`);
}

async function migratePipelineStageEnum(client) {
  console.log('TASK-06: Migrating pipeline_stage enum...');

  // 1. Find and drop the existing CHECK constraint on pipeline_stage (if any).
  // We don't know the auto-generated constraint name, so look it up.
  const { rows: constraints } = await client.query(
    `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'leads'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%pipeline_stage%'`
  );

  for (const row of constraints) {
    await client.query(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    console.log(`  -> Dropped existing CHECK constraint ${row.conname}`);
  }

  // 2. Remap legacy stage values. UPDATE is naturally idempotent — rows
  //    already on new stages won't match the WHERE clause.
  let totalRemapped = 0;
  for (const [oldStage, newStage] of Object.entries(STAGE_REMAP)) {
    const result = await client.query(
      'UPDATE leads SET pipeline_stage = $1 WHERE pipeline_stage = $2',
      [newStage, oldStage]
    );
    if (result.rowCount > 0) {
      console.log(`  -> Remapped ${result.rowCount} rows: ${oldStage} -> ${newStage}`);
      totalRemapped += result.rowCount;
    }
  }
  if (totalRemapped === 0) {
    console.log('  -> No legacy pipeline_stage rows to remap.');
  }

  // 3. Add the new CHECK constraint with the 9 MSP stages.
  //    DROP IF EXISTS first so this is idempotent across re-runs.
  await client.query('ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check');

  const stageList = NEW_PIPELINE_STAGES.map(s => `'${s}'`).join(', ');
  await client.query(
    `ALTER TABLE leads
       ADD CONSTRAINT leads_pipeline_stage_check
       CHECK (pipeline_stage IN (${stageList}))`
  );
  console.log(`  -> Added new CHECK constraint with ${NEW_PIPELINE_STAGES.length} stages.`);

  // 4. Ensure the default is still 'new'.
  await client.query("ALTER TABLE leads ALTER COLUMN pipeline_stage SET DEFAULT 'new'");
}

async function stripDeprecatedSettings(client) {
  console.log('TASK-07: Removing deprecated settings rows...');

  const result = await client.query(
    'DELETE FROM settings WHERE key = ANY($1::text[])',
    [DEPRECATED_SETTINGS_KEYS]
  );
  console.log(`  -> Deleted ${result.rowCount} deprecated settings rows (of ${DEPRECATED_SETTINGS_KEYS.length} candidate keys).`);
}

async function dropDeprecatedTables(client) {
  console.log('TASK-08-11: Dropping deprecated tables (outreach_queue, call_log, email_log)...');

  const tables = ['outreach_queue', 'call_log', 'email_log'];
  for (const table of tables) {
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    console.log(`  -> Dropped table ${table} (if it existed).`);
  }
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('Running Helix migration runner...');
    console.log('');

    await client.query('BEGIN');

    await migrateMspColumns(client);
    await migratePipelineStageEnum(client);
    await stripDeprecatedSettings(client);
    await dropDeprecatedTables(client);

    await client.query('COMMIT');

    console.log('');
    console.log('Migration complete!');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors during error reporting
    }
    console.error('Migration error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
