const db = require('./database');

async function checkSchema() {
    db.pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings'", (err, res) => {
        if (err) console.error(err);
        else console.log(res.rows);
        process.exit(0);
    });
}
checkSchema();
