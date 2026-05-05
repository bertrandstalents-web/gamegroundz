require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

(async () => {
    await client.connect();
    const res = await client.query('SELECT * FROM bookings ORDER BY id DESC LIMIT 5');
    console.log(res.rows);
    await client.end();
})();
