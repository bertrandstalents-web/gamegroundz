require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Parse DATABASE_URL if available, otherwise it will fail to connect (which is expected until user sets it)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false } // Neon requires SSL
});

// Helper to convert SQLite ? to Postgres $1, $2, etc.
function adaptQuery(sql, params = []) {
    let i = 1;
    let newSql = sql.replace(/\?/g, () => '$' + i++);
    return newSql;
}

const db = {
    pool: pool,
    get: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        
        pool.query(adaptQuery(sql, params), params, (err, res) => {
            if (err) return callback ? callback(err) : null;
            callback && callback(null, res.rows[0]);
        });
        return this;
    },
    all: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        
        pool.query(adaptQuery(sql, params), params, (err, res) => {
            if (err) return callback ? callback(err) : null;
            callback && callback(null, res.rows);
        });
        return this;
    },
    run: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        
        let querySql = adaptQuery(sql, params);
        
        // Postgres needs RETURNING id for inserts if we want this.lastID
        if (querySql.trim().toUpperCase().startsWith('INSERT') && !querySql.toLowerCase().includes('returning id')) {
            querySql += ' RETURNING id';
        }

        pool.query(querySql, params, (err, res) => {
            if (err) return callback ? callback(err) : null;
            
            const context = {
                changes: res ? res.rowCount : 0,
                lastID: res && res.rows && res.rows.length > 0 ? res.rows[0].id : null
            };
            
            callback && callback.call(context, null);
        });
        return this;
    },
    serialize: function(callback) {
        // We do not strict-serialize dynamically anymore. 
        // Real serialization is handled by async/await in the init function below.
        callback();
    }
};

// Check connection and run migrations synchronously
async function initDatabase() {
    let client;
    try {
        client = await pool.connect();
        console.log('Connected to PostgreSQL database.');

        // Users Table
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'player',
            status TEXT DEFAULT 'active',
            company_name TEXT,
            stripe_account_id TEXT,
            stripe_onboarding_complete INTEGER DEFAULT 0,
            first_name TEXT,
            last_name TEXT,
            phone_number TEXT,
            profile_picture TEXT,
            terms_accepted INTEGER DEFAULT 0,
            terms_accepted_at TEXT
        )`);

        // Facilities Table
        await client.query(`CREATE TABLE IF NOT EXISTS facilities (
            id SERIAL PRIMARY KEY,
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
            is_instant_book INTEGER DEFAULT 0,
            host_id INTEGER DEFAULT 1 REFERENCES users(id),
            operating_hours TEXT DEFAULT '{"open": "06:00", "close": "23:00"}',
            listing_status TEXT DEFAULT 'pending',
            advance_booking_days INTEGER DEFAULT 180,
            lat REAL,
            lng REAL,
            has_processing_fee INTEGER DEFAULT 1,
            processing_fee_amount REAL DEFAULT 15.00,
            co_host_emails TEXT DEFAULT '[]',
            connected_facilities TEXT DEFAULT '[]'
        )`);

        try {
            await client.query(`ALTER TABLE users ADD COLUMN terms_accepted INTEGER DEFAULT 0`);
            await client.query(`UPDATE users SET terms_accepted = 1 WHERE role = 'admin'`);
        } catch(e) {}
        
        try {
            await client.query(`ALTER TABLE users ADD COLUMN terms_accepted_at TEXT`);
        } catch(e) {}

        // Facility Images Table
        await client.query(`CREATE TABLE IF NOT EXISTS facility_images (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER REFERENCES facilities(id),
            image_url TEXT NOT NULL,
            is_primary INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN advance_booking_days INTEGER DEFAULT 180`);
        } catch(e) {}
        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN lat REAL`);
            await client.query(`ALTER TABLE facilities ADD COLUMN lng REAL`);
        } catch(e) {}
        
        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN has_processing_fee INTEGER DEFAULT 1`);
            await client.query(`ALTER TABLE facilities ADD COLUMN processing_fee_amount REAL DEFAULT 15.00`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN co_host_emails TEXT DEFAULT '[]'`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN connected_facilities TEXT DEFAULT '[]'`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN sort_order INTEGER DEFAULT 0`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN pricing_unit TEXT DEFAULT 'hour'`);
        } catch(e) {}

        // Discounts Table
        await client.query(`CREATE TABLE IF NOT EXISTS discounts (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER REFERENCES facilities(id),
            discount_type TEXT NOT NULL,
            value REAL NOT NULL,
            start_date TIMESTAMP,
            end_date TIMESTAMP,
            start_time TEXT,
            end_time TEXT,
            recurring_day INTEGER,
            is_last_minute INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_by_admin INTEGER DEFAULT 0
        )`);

        // Bookings Table
        await client.query(`CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            facility_id INTEGER REFERENCES facilities(id),
            booking_date TEXT NOT NULL,
            time_slots TEXT,
            total_price REAL,
            status TEXT DEFAULT 'pending',
            booking_type TEXT DEFAULT 'online',
            manual_notes TEXT,
            payment_status TEXT DEFAULT 'pending',
            stripe_session_id TEXT,
            review_email_sent INTEGER DEFAULT 0,
            recurring_group_id TEXT,
            is_read INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            capacity INTEGER DEFAULT 0,
            participant_price REAL DEFAULT 0.0
        )`);

        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN review_email_sent INTEGER DEFAULT 0`);
        } catch(e) {}
        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN recurring_group_id TEXT`);
        } catch(e) {}
        
        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN is_read INTEGER DEFAULT 0`);
            await client.query(`UPDATE bookings SET is_read = 1 WHERE is_read IS NULL OR is_read = 0`);
        } catch(e) {}
        
        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN is_archived INTEGER DEFAULT 0`);
        } catch(e) {}

        try { await client.query(`ALTER TABLE bookings ADD COLUMN capacity INTEGER DEFAULT 0`); } catch(e) {}
        try { await client.query(`ALTER TABLE bookings ADD COLUMN participant_price REAL DEFAULT 0.0`); } catch(e) {}
        try { await client.query(`ALTER TABLE bookings ADD COLUMN participant_kid_price REAL DEFAULT 0.0`); } catch(e) {}


        // Public Session Participants Table
        await client.query(`CREATE TABLE IF NOT EXISTS public_session_participants (
            id SERIAL PRIMARY KEY,
            booking_id INTEGER REFERENCES bookings(id),
            user_id INTEGER REFERENCES users(id),
            payment_status TEXT DEFAULT 'pending',
            stripe_session_id TEXT,
            quantity_adult INTEGER DEFAULT 1,
            quantity_kid INTEGER DEFAULT 0,
            quantity INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        try { await client.query(`ALTER TABLE public_session_participants ADD COLUMN quantity_adult INTEGER DEFAULT 1`); } catch(e) {}
        try { await client.query(`ALTER TABLE public_session_participants ADD COLUMN quantity_kid INTEGER DEFAULT 0`); } catch(e) {}

        try { await client.query(`ALTER TABLE users ADD COLUMN municipality_id INTEGER REFERENCES facilities(id)`); } catch(e) {}
        try { await client.query(`ALTER TABLE users ADD COLUMN residency_city TEXT`); } catch(e) {}
        try { await client.query(`ALTER TABLE users ADD COLUMN residency_document_url TEXT`); } catch(e) {}
        try { await client.query(`ALTER TABLE users ADD COLUMN residency_status TEXT DEFAULT 'none'`); } catch(e) {}
        try { await client.query(`ALTER TABLE users ADD COLUMN residency_applied_at TIMESTAMP`); } catch(e) {}
        try { await client.query(`ALTER TABLE users ADD COLUMN interested_surfaces TEXT DEFAULT '[]'`); } catch(e) {}

        try {
            await client.query(`ALTER TABLE facilities ADD COLUMN facility_type TEXT DEFAULT 'Other'`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN residents_only INTEGER DEFAULT 0`);
        } catch(e) {}

        try {
            await client.query(`ALTER TABLE bookings ADD COLUMN locker_room_assignment TEXT DEFAULT ''`);
        } catch(e) {}

        // Reviews Table
        await client.query(`CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER REFERENCES facilities(id),
            user_id INTEGER REFERENCES users(id),
            booking_id INTEGER REFERENCES bookings(id),
            rating REAL NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Saved Facilities Table
        await client.query(`CREATE TABLE IF NOT EXISTS saved_facilities (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            facility_id INTEGER REFERENCES facilities(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, facility_id)
        )`);

        // Password Reset Tokens Table
        await client.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            token TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Pending Checkouts Table for storing large multi-day payload metadata
        await client.query(`CREATE TABLE IF NOT EXISTS pending_checkouts (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Seed initial Facility data if the table is empty
        const res = await client.query("SELECT COUNT(*) as count FROM facilities");
        if (parseInt(res.rows[0].count) === 0) {
            console.log("Seeding initial facility data...");
            
            // Ensure at least one user exists to act as host (to satisfy PG foreign key wrapper)
            const userRes = await client.query("SELECT COUNT(*) as count FROM users");
            if (parseInt(userRes.rows[0].count) === 0) {
                await client.query(`INSERT INTO users (name, email, password, role, company_name) VALUES ('System Admin', 'admin@gamegroundz.com', 'dummy_password', 'admin', 'Metro Sports')`);
            }
            
            const facilitiesData = [
                ['Aréna Rosemère', 'Professional NHL-sized Ice Rink', 'Arena Rosemère is a premier ice hockey facility located in the heart of Rosemère...', '[{"title":"Premium Ice Quality","description":"Resurfaced before every rental block with our state-of-the-art Olympia resurfacer."}]', 4, 300, '200ft x 85ft', '["wifi", "parking", "locker_rooms", "accessibility"]', 'ice', 'indoor', 150, '[{"start":"08:00","end":"12:00","price":150},{"start":"13:00","end":"20:00","price":197}]', 'Rosemère, QC', 4.9, 128, 'images/arena_rosemere_real.jpg', 1, 1, '{"open": "06:00", "close": "23:00"}', 'approved', 45.6372, -73.7997],
                ['Aréna Municipale Boisbriand', 'Professional NHL-sized Ice Rink', 'Arena Municipale Boisbriand is a premier ice hockey facility.', '[]', 2, 150, 'NHL Size', '["parking", "locker_rooms"]', 'ice', 'indoor', 160, '[{"start":"08:00","end":"14:00","price":160},{"start":"14:00","end":"22:00","price":198}]', 'Boisbriand, QC', 4.8, 94, 'images/arena_boisbriand_real.jpg', 0, 1, '{"open": "07:00", "close": "22:00"}', 'approved', 45.6181, -73.8378],
                ['Colisée de Laval', 'Professional NHL-sized Ice Rink', 'Colisée de Laval is a premier ice hockey facility.', '[]', 8, 2000, 'Olympic Size', '["wifi", "parking", "locker_rooms", "concessions", "accessibility"]', 'ice', 'indoor', 180, '[{"start":"06:00","end":"16:00","price":180},{"start":"16:00","end":"23:00","price":210}]', 'Laval, QC', 5.0, 42, 'images/colisee_laval_real.jpg', 1, 1, '{"open": "05:00", "close": "00:00"}', 'approved', 45.6028, -73.7169],
                ['Complexe Sportif AP', 'Professional NHL-sized Ice Rink', 'Complexe Sportif AP is a premier ice hockey facility.', '[]', 4, 500, 'NHL Size', '["parking", "locker_rooms"]', 'ice', 'indoor', 140, '[{"start":"07:00","end":"15:00","price":140},{"start":"15:00","end":"22:00","price":160}]', 'Deux-Montagnes, QC', 4.7, 103, 'images/complexe_sportif_ap_real.jpg', 1, 1, '{"open": "06:00", "close": "23:00"}', 'approved', 45.5410, -73.8893],
                ['Peak Performance Gym', 'Fully Equipped Fitness Center', 'Peak Performance Gym is a premier training facility.', '[]', 2, 50, '10,000 sq ft', '["wifi", "parking", "locker_rooms", "showers"]', 'gym', 'indoor', 40, '[{"start":"05:00","end":"09:00","price":50},{"start":"09:00","end":"16:00","price":40},{"start":"16:00","end":"21:00","price":60}]', 'Montreal, QC', 4.9, 56, 'https://images.unsplash.com/photo-1540324155974-7523202daa3f?auto=format&fit=crop&w=800&q=80', 1, 1, '{"open": "05:00", "close": "22:00"}', 'approved', 45.5017, -73.5673],
                ['Capital High Field', 'Premium Synthetic Turf Field', 'Capital High Field is a premier outdoor football facility.', '[]', 2, 1000, '120 yards', '["parking", "concessions"]', 'football', 'outdoor', 120, '[{"start":"08:00","end":"14:00","price":120},{"start":"14:00","end":"20:00","price":150}]', 'Montreal, QC', 4.5, 210, 'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?auto=format&fit=crop&w=800&q=80', 0, 1, '{"open": "06:00", "close": "22:00"}', 'approved', 45.5017, -73.5673]
            ];

            const insertQuery = `INSERT INTO facilities 
                (name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, rating, reviews_count, image_url, is_instant_book, host_id, operating_hours, listing_status, advance_booking_days, lat, lng, has_processing_fee, processing_fee_amount, connected_facilities) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 180, $21, $22, 1, 15.00, '[]')`;

            for (let f of facilitiesData) {
                await client.query(insertQuery, f);
            }
            
            console.log("Seeding complete.");
        }
    } catch (err) {
        console.error('Error connecting to PostgreSQL or running migrations:', err);
    } finally {
        if (client) client.release();
    }
}

initDatabase();

module.exports = db;
