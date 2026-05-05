const db = require('./database.js');
db.all("SELECT id, name, facility_id, locker_rooms FROM surfaces;", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
    process.exit(0);
});
