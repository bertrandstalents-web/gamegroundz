const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session Middleware
app.use(session({
    secret: 'gamegroundz-super-secret-key', // In production, use environment variable
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Serve static frontend files from current directory
app.use(express.static(path.join(__dirname)));

// API Routes

// --- AUTHENTICATION ---

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        // Check if user already exists
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (row) return res.status(400).json({ error: "User with this email already exists" });

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Insert new user
            db.run(
                "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                [name, email, hashedPassword],
                function(err) {
                    if (err) return res.status(500).json({ error: "Error creating user" });
                    
                    // Automatically log in the user after registration
                    req.session.userId = this.lastID;
                    req.session.userRole = 'player';
                    req.session.userName = name;
                    
                    res.status(201).json({ 
                        message: "User registered successfully", 
                        user: { id: this.lastID, name: name, email: email, role: 'player' } 
                    });
                }
            );
        });
    } catch (error) {
         res.status(500).json({ error: "Server error" });
    }
});

// User Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(401).json({ error: "Invalid email or password" });

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });

        // Set session
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userName = user.name;

        res.json({ 
            message: "Logged in successfully", 
            user: { id: user.id, name: user.name, email: user.email, role: user.role } 
        });
    });
});

// User Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Could not log out" });
        res.clearCookie('connect.sid');
        res.json({ message: "Logged out successfully" });
    });
});

// Get Current User
app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    
    db.get("SELECT id, name, email, role FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    });
});


// GET all facilities (with optional filtering)
app.get('/api/facilities', (req, res) => {
    const { type, types, environment, maxPrice, limit, offset } = req.query;
    let query = "SELECT * FROM facilities WHERE 1=1";
    const params = [];

    if (types) {
        const typeArray = types.split(',');
        const placeholders = typeArray.map(() => '?').join(',');
        query += ` AND type IN (${placeholders})`;
        params.push(...typeArray);
    } else if (type) {
        query += " AND type = ?";
        params.push(type);
    }
    
    if (environment) {
        query += " AND environment = ?";
        params.push(environment);
    }

    if (maxPrice && !isNaN(maxPrice)) {
        query += " AND base_price <= ?";
        params.push(maxPrice);
    }

    if (limit && !isNaN(limit)) {
        query += " ORDER BY id DESC LIMIT ?";
        params.push(limit);
        if (offset && !isNaN(offset)) {
            query += " OFFSET ?";
            params.push(offset);
        }
    } else {
         query += " ORDER BY id DESC";
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// GET single facility by ID
app.get('/api/facilities/:id', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM facilities WHERE id = ?", [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: "Facility not found" });
            return;
        }
        res.json(row);
    });
});

// POST a new facility
app.post('/api/facilities', (req, res) => {
    const { name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, image_url, is_instant_book } = req.body;
    
    if (!name || !type || !environment || !base_price || !location || !image_url) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    let rulesStr = '[]';
    let featuresStr = '[]';
    let amenitiesStr = '[]';
    
    if (pricing_rules && Array.isArray(pricing_rules)) {
        rulesStr = JSON.stringify(pricing_rules);
    }
    if (features && Array.isArray(features)) {
        featuresStr = JSON.stringify(features);
    }
    if (amenities && Array.isArray(amenities)) {
        amenitiesStr = JSON.stringify(amenities);
    }

    db.run(
        `INSERT INTO facilities 
         (name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, image_url, is_instant_book) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, environment, base_price, rulesStr, location, image_url, is_instant_book ? 1 : 0],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ 
                message: "Facility created successfully", 
                facility_id: this.lastID 
            });
        }
    );
});

// GET all bookings for current user
app.get('/api/bookings/my', (req, res) => {
    const user_id = req.session.userId || 1; 

    // Join with facilities to get facility name and image
    const query = `
        SELECT b.*, f.name as facility_name, f.image_url, f.location
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.user_id = ?
        ORDER BY b.booking_date DESC
    `;

    db.all(query, [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET bookings for a facility (e.g. to block out times)
app.get('/api/bookings/:facility_id', (req, res) => {
    const { facility_id } = req.params;
    const { date } = req.query;
    
    let query = "SELECT * FROM bookings WHERE facility_id = ?";
    const params = [facility_id];

    if (date) {
        query += " AND booking_date = ?";
        params.push(date);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/bookings', (req, res) => {
    const { facility_id, booking_date, time_slots, total_price } = req.body;
    
    // In a real app we would get the user_id from an auth token or session
    const user_id = req.session.userId || 1; 

    db.run(
        "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price) VALUES (?, ?, ?, ?, ?)",
        [user_id, facility_id, booking_date, time_slots, total_price],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ 
                message: "Booking created successfully", 
                booking_id: this.lastID 
            });
        }
    );
});

// Fallback for 404 Not Found
app.use((req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: "API Endpoint not found" });
    }
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
