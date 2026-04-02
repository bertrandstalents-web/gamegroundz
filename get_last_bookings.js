const sqlite3 = require('sqlite3');
const { Pool } = require('pg');
require('dotenv').config();

const db = new sqlite3.Database('gamegroundz.db');
db.all("SELECT id, booking_date, manual_notes FROM bookings ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) console.error("SQLite Error:", err.message);
    else console.log("SQLite Last 5:", rows);
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, booking_date, manual_notes FROM bookings ORDER BY id DESC LIMIT 5", (err, res) => {
    if (err) console.error("PG Error:", err.message);
    else console.log("PG Last 5:", res ? res.rows : null);
    pool.end();
});
