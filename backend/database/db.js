const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tesseraflow.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

async function initDatabase() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing database if it exists, otherwise create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Initialize schema - split into individual statements
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Remove all SQL comments, then split on semicolons
  const cleanedSchema = schema.replace(/--[^\n]*/g, '');
  const statements = cleanedSchema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      db.run(stmt);
    } catch (err) {
      // Ignore "already exists" type errors
      if (!err.message.includes('already exists')) {
        console.warn('Schema statement warning:', err.message);
      }
    }
  }

  // Migrations: add columns that may not exist yet
  const migrations = [
    "ALTER TABLE calendar_events ADD COLUMN google_event_id TEXT",
  ];
  for (const migration of migrations) {
    try {
      db.run(migration);
    } catch (err) {
      // Ignore "duplicate column" errors
      if (!err.message.includes('duplicate column')) {
        console.warn('Migration warning:', err.message);
      }
    }
  }

  // Save to disk
  saveDatabase();

  console.log('Database initialized at:', DB_PATH);
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Helper: run a query and return affected rows info
function run(sql, params = []) {
  const d = getDb();
  d.run(sql, params);
  const result = d.exec('SELECT last_insert_rowid() as id, changes() as changes');
  saveDatabase();
  return {
    lastInsertRowid: result.length > 0 ? result[0].values[0][0] : 0,
    changes: result.length > 0 ? result[0].values[0][1] : 0
  };
}

// Helper: get all rows as objects
function all(sql, params = []) {
  const d = getDb();
  try {
    const stmt = d.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error('Query error:', err.message, 'SQL:', sql);
    return [];
  }
}

// Helper: get single row as object
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  initDatabase,
  getDb,
  saveDatabase,
  run,
  all,
  get
};
