/**
 * PostgreSQL Connection Pool
 *
 * Replaces the sql.js (SQLite) driver with node-postgres.
 * Uses a connection pool for concurrent multi-user access.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Execute a parameterized query
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {Array} params - Parameter values
 * @returns {Promise<{rows: Array, rowCount: number}>}
 */
async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = {
  query,
  pool,
};
