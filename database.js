const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'gamegroundz.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Define Database Schema
        db.serialize(() => {
            
            // Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'player' -- 'player' or 'host'
            )`);

            // Facilities Table
            db.run(`CREATE TABLE IF NOT EXISTS facilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                subtitle TEXT,
                description TEXT,
                features TEXT DEFAULT '[]',
                locker_rooms INTEGER DEFAULT 0,
                capacity INTEGER DEFAULT 0,
                size_info TEXT DEFAULT '',
                amenities TEXT DEFAULT '[]',
                type TEXT NOT NULL,
                environment TEXT NOT NULL,
                base_price INTEGER NOT NULL,
                pricing_rules TEXT DEFAULT '[]',
                location TEXT NOT NULL,
                rating REAL DEFAULT 0,
                reviews_count INTEGER DEFAULT 0,
                image_url TEXT NOT NULL,
                is_instant_book BOOLEAN DEFAULT 0,
                host_id INTEGER DEFAULT 1,
                operating_hours TEXT DEFAULT '{"open": "06:00", "close": "23:00"}',
                FOREIGN KEY(host_id) REFERENCES users(id)
            )`);
            
            // Add columns to existing table if they don't exist (migrations)
            db.run(`ALTER TABLE facilities ADD COLUMN subtitle TEXT`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN description TEXT`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN features TEXT DEFAULT '[]'`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN locker_rooms INTEGER DEFAULT 0`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN capacity INTEGER DEFAULT 0`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN size_info TEXT DEFAULT ''`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN amenities TEXT DEFAULT '[]'`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN host_id INTEGER DEFAULT 1`, (err) => {});
            db.run(`ALTER TABLE facilities ADD COLUMN operating_hours TEXT DEFAULT '{"open": "06:00", "close": "23:00"}'`, (err) => {});

            // Bookings Table
            db.run(`CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                facility_id INTEGER,
                booking_date TEXT NOT NULL,
                time_slots TEXT,
                total_price REAL,
                status TEXT DEFAULT 'pending',
                booking_type TEXT DEFAULT 'online',
                manual_notes TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(facility_id) REFERENCES facilities(id)
            )`);
            
            // Add columns to existing bookings table if they don't exist
            db.run(`ALTER TABLE bookings ADD COLUMN booking_type TEXT DEFAULT 'online'`, (err) => {});
            db.run(`ALTER TABLE bookings ADD COLUMN manual_notes TEXT`, (err) => {});

            // Seed initial Facility data if the table is empty
            db.get("SELECT COUNT(*) as count FROM facilities", (err, row) => {
                if (err) {
                    console.error("Error checking facilities count:", err.message);
                    return;
                }
                if (row.count === 0) {
                    console.log("Seeding initial facility data...");
                    const stmt = db.prepare(`INSERT INTO facilities 
                        (name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, rating, reviews_count, image_url, is_instant_book, host_id, operating_hours) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

                    const facilitiesData = [
                        ['Aréna Rosemère', 'Professional NHL-sized Ice Rink', 'Arena Rosemère is a premier ice hockey facility located in the heart of Rosemère...', '[{"title":"Premium Ice Quality","description":"Resurfaced before every rental block with our state-of-the-art Olympia resurfacer."}]', 4, 300, '200ft x 85ft', '["wifi", "parking", "locker_rooms", "accessibility"]', 'ice', 'indoor', 150, '[{"start":"08:00","end":"12:00","price":150},{"start":"13:00","end":"20:00","price":197}]', 'Rosemère, QC', 4.9, 128, 'images/arena_rosemere_real.jpg', 1, 1, '{"open": "06:00", "close": "23:00"}'],
                        ['Aréna Municipale Boisbriand', 'Professional NHL-sized Ice Rink', 'Arena Municipale Boisbriand is a premier ice hockey facility.', '[]', 2, 150, 'NHL Size', '["parking", "locker_rooms"]', 'ice', 'indoor', 160, '[{"start":"08:00","end":"14:00","price":160},{"start":"14:00","end":"22:00","price":198}]', 'Boisbriand, QC', 4.8, 94, 'images/arena_boisbriand_real.jpg', 0, 1, '{"open": "07:00", "close": "22:00"}'],
                        ['Colisée de Laval', 'Professional NHL-sized Ice Rink', 'Colisée de Laval is a premier ice hockey facility.', '[]', 8, 2000, 'Olympic Size', '["wifi", "parking", "locker_rooms", "concessions", "accessibility"]', 'ice', 'indoor', 180, '[{"start":"06:00","end":"16:00","price":180},{"start":"16:00","end":"23:00","price":210}]', 'Laval, QC', 5.0, 42, 'images/colisee_laval_real.jpg', 1, 1, '{"open": "05:00", "close": "00:00"}'],
                        ['Complexe Sportif AP', 'Professional NHL-sized Ice Rink', 'Complexe Sportif AP is a premier ice hockey facility.', '[]', 4, 500, 'NHL Size', '["parking", "locker_rooms"]', 'ice', 'indoor', 140, '[{"start":"07:00","end":"15:00","price":140},{"start":"15:00","end":"22:00","price":160}]', 'Deux-Montagnes, QC', 4.7, 103, 'images/complexe_sportif_ap_real.jpg', 1, 1, '{"open": "06:00", "close": "23:00"}'],
                        ['Peak Performance Gym', 'Fully Equipped Fitness Center', 'Peak Performance Gym is a premier training facility.', '[]', 2, 50, '10,000 sq ft', '["wifi", "parking", "locker_rooms", "showers"]', 'gym', 'indoor', 40, '[{"start":"05:00","end":"09:00","price":50},{"start":"09:00","end":"16:00","price":40},{"start":"16:00","end":"21:00","price":60}]', 'Montreal, QC', 4.9, 56, 'https://images.unsplash.com/photo-1540324155974-7523202daa3f?auto=format&fit=crop&w=800&q=80', 1, 1, '{"open": "05:00", "close": "22:00"}'],
                        ['Capital High Field', 'Premium Synthetic Turf Field', 'Capital High Field is a premier outdoor football facility.', '[]', 2, 1000, '120 yards', '["parking", "concessions"]', 'football', 'outdoor', 120, '[{"start":"08:00","end":"14:00","price":120},{"start":"14:00","end":"20:00","price":150}]', 'Montreal, QC', 4.5, 210, 'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?auto=format&fit=crop&w=800&q=80', 0, 1, '{"open": "06:00", "close": "22:00"}']
                    ];

                    facilitiesData.forEach(f => {
                        stmt.run(f, (err) => {
                            if (err) console.error("Error inserting data:", err.message);
                        });
                    });

                    stmt.finalize();
                    console.log("Seeding complete.");
                }
            });
        });
    }
});

module.exports = db;
