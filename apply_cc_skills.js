require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Target: ID 59
        const recurringGroupId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await client.query(
            "UPDATE bookings SET recurring_group_id = $1 WHERE id = 59",
            [recurringGroupId]
        );
        
        const booking_date = "2025-09-01"; // Starts September 1st
        const repeat_until = "2026-05-05"; // Until May 5th
        const repeat_days = [1, 2, 3, 4]; // Mon, Tue, Wed, Thu
        
        const startDate = new Date(booking_date + 'T00:00:00');
        const endDate = new Date(repeat_until + 'T23:59:59');
        let currentDate = new Date(startDate);
        
        let datesToBook = [];
        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            if (dateStr !== "2026-03-30") { // Skip the one we already have
                if (repeat_days.includes(currentDate.getDay())) {
                    datesToBook.push(dateStr);
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        console.log(`Generating ${datesToBook.length} bookings...`);
        
        const insertSql = `
            INSERT INTO bookings (facility_id, booking_date, time_slots, total_price, status, booking_type, manual_notes, recurring_group_id, is_read)
            VALUES ($1, $2, $3, 0, 'confirmed', 'manual', $4, $5, 1)
        `;
        const time_slots_str = JSON.stringify(["09:00","09:30","10:00","10:30","11:00","11:30"]);
        
        for (const d of datesToBook) {
            await client.query(insertSql, [10, d, time_slots_str, 'CC Skills', recurringGroupId]);
        }
        
        await client.query('COMMIT');
        console.log("Success!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error:", e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
