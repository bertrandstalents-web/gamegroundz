const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/gamegroundz.db');

db.serialize(() => {
    // Check if bookings were generated starting from 2026-03-30
    db.all("SELECT * FROM bookings ORDER BY id DESC LIMIT 10", (err, rows) => {
        if (err) {
            console.error("Error:", err);
            return;
        }
        console.log("Recent Bookings:", rows);
    });
});
