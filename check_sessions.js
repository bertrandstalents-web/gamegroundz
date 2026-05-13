const db = require('./database.js');
setTimeout(() => {
    db.all("SELECT id, facility_id, surface_id, booking_date FROM public_sessions", (err, rows) => {
        if (err) console.error(err);
        else console.log("Public Sessions:", rows);
        
        db.all("SELECT facility_id, name FROM facilities WHERE name='Premium Sports Facility'", (err, fRows) => {
            console.log("Premium Facilities:", fRows);
            process.exit();
        });
    });
}, 1000);
