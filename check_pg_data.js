const db = require('./database');

async function checkData() {
    db.pool.query("SELECT id, booking_type, pricing_tiers FROM bookings WHERE booking_type = 'public_session' ORDER BY id DESC LIMIT 10", (err, res) => {
        if (err) console.error(err);
        else console.log(res.rows);
        process.exit(0);
    });
}
checkData();
