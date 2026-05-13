require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query("SELECT id, name, pricing_rules FROM surfaces WHERE name = 'arena st canut - Glace 1'");
  console.log(JSON.stringify(res.rows, null, 2));
  pool.end();
}
run();
