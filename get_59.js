require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT * FROM bookings WHERE id = 59", (err, res) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(res.rows[0], null, 2));
    pool.end();
});
