const db = require('./database');
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
  await pool.query('UPDATE facilities SET has_processing_fee = 0 WHERE id = 10');
  console.log("Updated to 0");
  process.exit();
}
run();
