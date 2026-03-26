require('dotenv').config();
const db = require('./database.js');
db.all("SELECT * FROM discounts", [], (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
});
