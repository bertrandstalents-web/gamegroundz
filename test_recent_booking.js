const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./gamegroundz.db');

const query = `
    SELECT b.id as booking_id, b.booking_date, b.time_slots, b.total_price, 
           f.name as facility_name, f.location as facility_location, f.host_id,
           u.name as player_name, u.email as player_email,
           h.name as host_name, h.email as host_email, h.company_name as host_company_name
    FROM bookings b
    JOIN facilities f ON b.facility_id = f.id
    JOIN users u ON b.user_id = u.id
    LEFT JOIN users h ON f.host_id = h.id
    ORDER BY b.id DESC LIMIT 1
`;

db.get(query, [], (err, row) => {
    if (err) {
        console.error("SQL Error:", err);
    } else if (!row) {
        console.error("Query succeeded but returned NO ROW!");
    } else {
        console.log("SUCCESS! Row data:");
        console.log(JSON.stringify(row, null, 2));
    }
    db.close();
});
