import pg from 'pg';
const { Pool } = pg;

/**
 * PostgreSQL connection pool for DevClip sync server
 * Lazy initialization - only connects when first query is made
 */

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      // Connection pool settings
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection not established
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });
}

/**
 * Check database connectivity
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseConnection() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
