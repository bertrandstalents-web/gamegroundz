const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const replacements = [
    {
        from: `         WHERE id = ? AND host_id = ?\`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, environment, base_price, rulesStr, location, lat || null, lng || null, image_url, is_instant_book ? 1 : 0, hoursStr, statusToSave, advance_booking_days ? parseInt(advance_booking_days, 10) : 180, has_processing_fee !== undefined ? (has_processing_fee ? 1 : 0) : 1, processing_fee_amount !== undefined ? parseFloat(processing_fee_amount) : 15.00, facilityId, req.session.userId],`,
        to: `         WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)\`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, environment, base_price, rulesStr, location, lat || null, lng || null, image_url, is_instant_book ? 1 : 0, hoursStr, statusToSave, advance_booking_days ? parseInt(advance_booking_days, 10) : 180, has_processing_fee !== undefined ? (has_processing_fee ? 1 : 0) : 1, processing_fee_amount !== undefined ? parseFloat(processing_fee_amount) : 15.00, facilityId, req.session.userId, \`%"\${req.session.email}"%\` ],`
    },
    {
        from: `db.all("SELECT * FROM facilities WHERE host_id = ? ORDER BY id DESC", [req.session.userId], (err, rows) => {`,
        to: `db.all("SELECT * FROM facilities WHERE host_id = ? OR co_host_emails LIKE ? ORDER BY id DESC", [req.session.userId, \`%"\${req.session.email}"%\`], (err, rows) => {`
    },
    {
        from: `        WHERE f.host_id = ? AND b.is_read = 0`,
        to: `        WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.is_read = 0`
    },
    {
        from: `    db.get(query, [req.session.userId], (err, row) => {`,
        to: `    db.get(query, [req.session.userId, \`%"\${req.session.email}"%\`], (err, row) => {`
    },
    {
        from: `            WHERE f.host_id = ? AND b.is_read = 0`,
        to: `            WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.is_read = 0`
    },
    {
        from: `    db.run(query, [req.session.userId], function(err) {`,
        to: `    db.run(query, [req.session.userId, \`%"\${req.session.email}"%\`], function(err) {`
    },
    {
        from: `        WHERE f.host_id = ?`,
        to: `        WHERE (f.host_id = ? OR f.co_host_emails LIKE ?)`
    },
    {
        from: `    db.all(query, [req.session.userId], (err, rows) => {`,
        to: `    db.all(query, [req.session.userId, \`%"\${req.session.email}"%\`], (err, rows) => {`
    },
    {
        from: `         WHERE b.id = ? AND f.host_id = ?\`,
        [bookingId, req.session.userId],`,
        to: `         WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)\`,
        [bookingId, req.session.userId, \`%"\${req.session.email}"%\`],`
    },
    {
        from: `        LEFT JOIN users h ON f.host_id = h.id`,
        to: `        LEFT JOIN users h ON f.host_id = h.id` // No change needed for this join
    },
    {
        from: `        if (row.user_id !== req.session.userId && row.host_id !== req.session.userId && req.session.userRole !== 'admin') {`,
        to: `        let isCoHost = false;
        try { if (row.co_host_emails && JSON.parse(row.co_host_emails).includes(req.session.email)) isCoHost = true; } catch(e){}
        if (row.user_id !== req.session.userId && row.host_id !== req.session.userId && !isCoHost && req.session.userRole !== 'admin') {`
    },
    {
        from: `        SELECT b.*, f.host_id `,
        to: `        SELECT b.*, f.host_id, f.co_host_emails `
    },
    {
        from: `        WHERE b.id = ? AND f.host_id = ?`,
        to: `        WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)`
    },
    {
        from: `    db.get(query, [bookingId, req.session.userId], async (err, booking) => {`,
        to: `    db.get(query, [bookingId, req.session.userId, \`%"\${req.session.email}"%\`], async (err, booking) => {`
    },
    {
        from: `    db.get("SELECT id FROM facilities WHERE id = ? AND host_id = ?", [facilityId, req.session.userId], (err, row) => {`,
        to: `    db.get("SELECT id FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facilityId, req.session.userId, \`%"\${req.session.email}"%\`], (err, row) => {`
    },
    {
        from: `    db.get("SELECT id FROM facilities WHERE id = ? AND host_id = ?", [facility_id, req.session.userId], (err, row) => {`,
        to: `    db.get("SELECT id FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facility_id, req.session.userId, \`%"\${req.session.email}"%\`], (err, row) => {`
    },
    {
        from: `        WHERE d.id = ? AND f.host_id = ?`,
        to: `        WHERE d.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)`
    },
    {
        from: `    db.get(stmt, [discountId, req.session.userId], (err, row) => {`,
        to: `    db.get(stmt, [discountId, req.session.userId, \`%"\${req.session.email}"%\`], (err, row) => {`
    },
    {
        from: `            WHERE d.id = ? AND f.host_id = ?\`, 
            [discountId, req.session.userId], (err, row) => {`,
        to: `            WHERE d.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)\`, 
            [discountId, req.session.userId, \`%"\${req.session.email}"%\`], (err, row) => {`
    }
];

let allGood = true;
for (const r of replacements) {
    if (r.from === r.to) continue; // skip NOOPs
    if (!content.includes(r.from)) {
        console.error("COULD NOT FIND STRING IN server.js:\\n" + r.from);
        allGood = false;
    } else {
        content = content.replace(r.from, r.to);
    }
}

if (allGood) {
    fs.writeFileSync('server.js', content);
    console.log("SUCCESS: Replaced all host_id checks with co_host_emails support.");
} else {
    console.log("FAILED to update some strings. See errors above.");
}
