require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

(async () => {
    await client.connect();
    const query = `
        SELECT b.id, u.email as player_email, h.email as host_email
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN users h ON f.host_id = h.id
        WHERE b.id = 886
    `;
    const res = await client.query(query);
    console.log(res.rows);
    await client.end();
})();
