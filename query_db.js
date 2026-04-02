const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, facility_id, booking_date, time_slots, manual_notes, recurring_group_id FROM bookings WHERE manual_notes = 'CC Skills' ORDER BY id DESC LIMIT 20", (err, res) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(res.rows, null, 2));
    pool.end();
});
