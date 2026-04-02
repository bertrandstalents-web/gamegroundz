require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query("SELECT id, booking_date, manual_notes, recurring_group_id FROM bookings WHERE manual_notes LIKE '%CC Skills%' ORDER BY id DESC LIMIT 10", (err, res) => {
    if (err) {
        console.error("PG Error:", err.message);
    } else {
        console.log("PG Last 10 Bookings matching CC Skills:");
        res.rows.forEach(row => {
            console.log(`ID: ${row.id} | Date: ${row.booking_date} | Notes: ${row.manual_notes} | RecId: ${row.recurring_group_id}`);
        });
    }
    pool.end();
});
