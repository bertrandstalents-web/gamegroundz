const db = require('./database');
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
async function migrate() {
  try {
    await pool.query(`ALTER TABLE facilities ADD COLUMN has_processing_fee INTEGER DEFAULT 1`);
    console.log("Added has_processing_fee");
  } catch(e) { console.log(e.message); }
  try {
    await pool.query(`ALTER TABLE facilities ADD COLUMN processing_fee_amount REAL DEFAULT 15.00`);
    console.log("Added processing_fee_amount");
  } catch(e) { console.log(e.message); }
  process.exit();
}
migrate();
