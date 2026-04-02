const http = require('http');

const payload = JSON.stringify({
    facility_id: 1,
    booking_date: "2023-09-01",
    time_slots: ["13:00", "13:30"],
    manual_notes: "Laval Rockets",
    repeat_option: "weekly",
    repeat_until: "2024-05-05",
    repeat_days: [1, 2, 3, 4]
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/host/block-time',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, res => {
    let rawData = '';
    res.on('data', chunk => rawData += chunk);
    res.on('end', () => console.log(res.statusCode, rawData));
});

req.on('error', e => console.error(e));
req.write(payload);
req.end();
