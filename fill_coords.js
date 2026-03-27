require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

async function main() {
    let client;
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

    if (isProduction) {
        client = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        await client.connect();
    } else {
        const sqlite3 = require('sqlite3').verbose();
        const { open } = require('sqlite');
        client = await open({
            filename: './gamegroundz.db',
            driver: sqlite3.Database
        });
    }

    let facilities;
    if (isProduction) {
        const res = await client.query('SELECT id, location FROM facilities WHERE lat IS NULL');
        facilities = res.rows;
    } else {
        facilities = await client.all('SELECT id, location FROM facilities WHERE lat IS NULL');
    }

    console.log(`Found ${facilities.length} facilities with missing coordinates.`);

    for (let f of facilities) {
        try {
            console.log(`Geocoding ${f.location}...`);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(f.location)}&limit=1&countrycodes=us,ca`;
            
            // Wait 1 second to respect Nominatim rate limit
            await new Promise(r => setTimeout(r, 1000));
            
            const response = await fetch(url, { headers: { "User-Agent": "GameGroundz/1.0" } });
            if (response.ok) {
                const data = await response.json();
                if (data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);
                    console.log(` -> Found: ${lat}, ${lng}`);
                    
                    if (isProduction) {
                        await client.query('UPDATE facilities SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, f.id]);
                    } else {
                        // sqlite implementation doesn't use placeholders the same way for .run directly on client from open
                        const stmt = await client.prepare('UPDATE facilities SET lat = ?, lng = ? WHERE id = ?');
                        await stmt.run(lat, lng, f.id);
                        await stmt.finalize();
                    }
                } else {
                    console.log(` -> No results found.`);
                }
            } else {
                console.log(` -> Response not ok: ${response.status}`);
            }
        } catch (err) {
            console.error(` -> Error geocoding ${f.location}:`, err);
        }
    }

    console.log("Geocoding complete.");
    
    if (isProduction) {
        await client.end();
    } else {
        await client.close();
    }
}

main().catch(console.error);
