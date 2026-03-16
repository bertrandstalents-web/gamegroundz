const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session Middleware
app.use(session({
    secret: 'gamegroundz-super-secret-key', // In production, use environment variable
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Serve static frontend files from current directory
app.use(express.static(path.join(__dirname)));

// API Routes

// --- AUTHENTICATION ---

// User Registration
app.post('/api/users/signup', async (req, res) => {
    try {
        let { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        
        email = email.trim().toLowerCase();

        // Check if user already exists
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
            try {
                if (err) return res.status(500).json({ error: "Database error" });
                if (row) return res.status(400).json({ error: "User with this email already exists" });

                // Hash password
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                
                // Auto-assign roles based on email
                let userRole = 'player';
                const lowerEmail = email.toLowerCase();
                if (lowerEmail === 'faucons76.tbertrand@gmail.com') {
                    userRole = 'admin';
                } else if (lowerEmail === 'bertrandstalents@gmail.com') {
                    userRole = 'host';
                }

                // Insert new user
                db.run(
                    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
                    [name, email, hashedPassword, userRole],
                    function(err) {
                        if (err) return res.status(500).json({ error: "Error creating user" });
                        
                        // Automatically log in the user after registration
                        req.session.userId = this.lastID;
                        req.session.userRole = userRole;
                        req.session.userName = name;
                        
                        res.status(201).json({ 
                            message: "User registered successfully", 
                            user: { id: this.lastID, name: name, email: email, role: userRole } 
                        });
                    }
                );
            } catch (err2) {
                res.status(500).json({ error: "Registration failed" });
            }
        });
    } catch (error) {
         res.status(500).json({ error: "Registration failed" });
    }
});

// User Login
app.post('/api/auth/login', (req, res) => {
    let { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    
    email = email.trim().toLowerCase();

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
    let query = "SELECT * FROM facilities WHERE listing_status = 'approved'";
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
    db.get(`
        SELECT f.*, u.name as host_name, u.company_name 
        FROM facilities f 
        LEFT JOIN users u ON f.host_id = u.id 
        WHERE f.id = ?
    `, [id], (err, row) => {
        if (err || !row) {
            return res.status(err ? 500 : 404).json({ error: err ? err.message : "Not found" });
        }
        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [id], (err, discounts) => {
            if (!err) row.discounts = discounts;
            res.json(row);
        });
    });
});

// POST a new facility
app.post('/api/facilities', (req, res) => {
    // Check if user is authenticated (backend guard)
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized: You must be logged in to list a facility." });
    }

    const { name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, image_url, is_instant_book, operating_hours, listing_status } = req.body;
    
    if (!name || !type || !environment || !base_price || !location || !image_url) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    let rulesStr = '[]';
    let featuresStr = '[]';
    let amenitiesStr = '[]';
    let hoursStr = '{"open": "06:00", "close": "23:00"}';
    
    if (pricing_rules && Array.isArray(pricing_rules)) {
        rulesStr = JSON.stringify(pricing_rules);
    }
    if (features && Array.isArray(features)) {
        featuresStr = JSON.stringify(features);
    }
    if (amenities && Array.isArray(amenities)) {
        amenitiesStr = JSON.stringify(amenities);
    }
    if (operating_hours && typeof operating_hours === 'object') {
        hoursStr = JSON.stringify(operating_hours);
    }

    const statusToSave = listing_status || 'pending';

    db.run(
        `INSERT INTO facilities 
         (name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, image_url, is_instant_book, host_id, operating_hours, listing_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, environment, base_price, rulesStr, location, image_url, is_instant_book ? 1 : 0, req.session.userId, hoursStr, statusToSave],
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

// PUT (Edit) an existing facility
app.put('/api/host/facilities/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized: You must be logged in to edit a facility." });
    }

    const facilityId = req.params.id;
    const { name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, environment, base_price, pricing_rules, location, image_url, is_instant_book, operating_hours, listing_status } = req.body;
    
    if (!name || !type || !environment || !base_price || !location || !image_url) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    let rulesStr = '[]';
    let featuresStr = '[]';
    let amenitiesStr = '[]';
    let hoursStr = '{"open": "06:00", "close": "23:00"}';
    
    if (pricing_rules && Array.isArray(pricing_rules)) {
        rulesStr = JSON.stringify(pricing_rules);
    }
    if (features && Array.isArray(features)) {
        featuresStr = JSON.stringify(features);
    }
    if (amenities && Array.isArray(amenities)) {
        amenitiesStr = JSON.stringify(amenities);
    }
    if (operating_hours && typeof operating_hours === 'object') {
        hoursStr = JSON.stringify(operating_hours);
    }

    const statusToSave = listing_status || 'pending';

    // Include host_id in the WHERE clause so users can only edit their own facilities
    db.run(
        `UPDATE facilities SET 
            name = ?, subtitle = ?, description = ?, features = ?, locker_rooms = ?, 
            capacity = ?, size_info = ?, amenities = ?, type = ?, environment = ?, 
            base_price = ?, pricing_rules = ?, location = ?, image_url = ?, 
            is_instant_book = ?, operating_hours = ?, listing_status = ? 
         WHERE id = ? AND host_id = ?`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, environment, base_price, rulesStr, location, image_url, is_instant_book ? 1 : 0, hoursStr, statusToSave, facilityId, req.session.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "Facility not found or you do not have permission to edit it." });
            }
            res.status(200).json({ message: "Facility updated successfully" });
        }
    );
});

// GET all facilities for the logged-in host
app.get('/api/host/facilities', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    db.all("SELECT * FROM facilities WHERE host_id = ? ORDER BY id DESC", [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET all bookings for the logged-in host's facilities
app.get('/api/host/bookings', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    const query = `
        SELECT b.*, f.name as facility_name, u.name as player_name, u.email as player_email
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE f.host_id = ?
        ORDER BY b.booking_date ASC, b.time_slots ASC
    `;
    
    db.all(query, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST a manual time block (offline reservation)
app.post('/api/host/block-time', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { facility_id, booking_date, time_slots, manual_notes } = req.body;
    
    if (!facility_id || !booking_date || !time_slots || !manual_notes) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const sql = `
        INSERT INTO bookings (facility_id, booking_date, time_slots, total_price, status, booking_type, manual_notes)
        VALUES (?, ?, ?, 0, 'confirmed', 'manual', ?)
    `;
    
    db.run(sql, [facility_id, booking_date, JSON.stringify(time_slots), manual_notes], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "Time blocked successfully", id: this.lastID });
    });
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

// --- DISCOUNTS Endpoints ---

// GET discounts for a host's facility
app.get('/api/host/discounts/:facility_id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const facilityId = req.params.facility_id;
    
    // Verify host owns this facility
    db.get("SELECT id FROM facilities WHERE id = ? AND host_id = ?", [facilityId, req.session.userId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? ORDER BY id DESC", [facilityId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

// POST new discount
app.post('/api/host/discounts', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const { facility_id, discount_type, value, start_date, end_date, recurring_day, is_last_minute } = req.body;
    
    if (!facility_id || !discount_type || !value) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    db.get("SELECT id FROM facilities WHERE id = ? AND host_id = ?", [facility_id, req.session.userId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied" });

        db.run(
            `INSERT INTO discounts (facility_id, discount_type, value, start_date, end_date, recurring_day, is_last_minute, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [facility_id, discount_type, value, start_date, end_date, recurring_day, is_last_minute],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ message: "Discount created", id: this.lastID });
            }
        );
    });
});

// DELETE a discount
app.delete('/api/host/discounts/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const discountId = req.params.id;

    // Verify ownership by joining facilities
    db.get(`SELECT d.id FROM discounts d 
            JOIN facilities f ON d.facility_id = f.id 
            WHERE d.id = ? AND f.host_id = ?`, 
            [discountId, req.session.userId], (err, row) => {
        
        if (err || !row) return res.status(403).json({ error: "Access denied" });

        db.run("DELETE FROM discounts WHERE id = ?", [discountId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(200).json({ message: "Discount deleted" });
        });
    });
});

// --- ADMIN Endpoints ---

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    db.get("SELECT role FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (err || !user || user.role !== 'admin') {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }
        next();
    });
};

// GET all facilities (for admin, no filters applied, includes pending/rejected)
app.get('/api/admin/facilities', requireAdmin, (req, res) => {
    db.all("SELECT * FROM facilities ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update facility listing_status (approve/reject/suspend)
app.put('/api/admin/facilities/:id/status', requireAdmin, (req, res) => {
    const { listing_status } = req.body;
    if (!listing_status) return res.status(400).json({ error: "Missing listing_status" });

    db.run("UPDATE facilities SET listing_status = ? WHERE id = ?", [listing_status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Facility not found" });
        res.json({ message: "Status updated successfully" });
    });
});

// GET all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
    db.all("SELECT id, name, email, role, status FROM users ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update user status (active/suspended)
app.put('/api/admin/users/:id/status', requireAdmin, (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Missing status" });

    if (parseInt(req.params.id) === req.session.userId && status === 'suspended') {
        return res.status(400).json({ error: "Cannot suspend yourself" });
    }

    db.run("UPDATE users SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "User not found" });
        res.json({ message: "User status updated successfully" });
    });
});

// GET platform-wide discounts
app.get('/api/admin/discounts', requireAdmin, (req, res) => {
    db.all("SELECT * FROM discounts WHERE facility_id IS NULL ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST platform-wide discount
app.post('/api/admin/discounts', requireAdmin, (req, res) => {
    const { discount_type, value, start_date, end_date } = req.body;
    if (!discount_type || !value) return res.status(400).json({ error: "Missing type or value" });

    db.run(
        `INSERT INTO discounts (facility_id, discount_type, value, start_date, end_date, is_active) 
         VALUES (NULL, ?, ?, ?, ?, 1)`,
        [discount_type, value, start_date, end_date],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: "Global discount created", id: this.lastID });
        }
    );
});

// DELETE platform-wide discount
app.delete('/api/admin/discounts/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM discounts WHERE id = ? AND facility_id IS NULL", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Discount not found" });
        res.json({ message: "Global discount deleted" });
    });
});

// --- BOOKINGS Endpoints ---

// Helper for price calculation
function calculatePrice(facility, timeSlots, discounts, bookingDateStr) {
    const bookingDate = new Date(bookingDateStr);
    const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'long' }); 
    
    // Check if booking is within 24 hours for last-minute discounts
    const now = new Date();
    // Assuming timezone matches roughly
    const isLastMinute = bookingDate.getTime() - now.getTime() < 86400000 && bookingDate.getTime() >= now.getTime() - 86400000; 

    // Find all valid discounts
    const validDiscounts = discounts.filter(d => {
        if (!d.is_active) return false;
        if (d.start_date && new Date(d.start_date) > bookingDate) return false;
        if (d.end_date && new Date(d.end_date) < bookingDate) return false;
        if (d.recurring_day && d.recurring_day !== dayOfWeek) return false;
        if (d.is_last_minute && !isLastMinute) return false;
        return true;
    });

    const basePrice = facility.base_price * timeSlots.length;
    
    // Apply the best single discount
    let bestDiscountValue = 0;
    validDiscounts.forEach(d => {
        let discountVal = 0;
        if (d.discount_type === 'percentage') {
            discountVal = basePrice * (d.value / 100);
        } else if (d.discount_type === 'fixed_amount') {
            discountVal = d.value;
        }
        if (discountVal > bestDiscountValue) bestDiscountValue = discountVal;
    });

    const finalPrice = Math.max(0, basePrice - bestDiscountValue);
    return {
        base_price: basePrice,
        discount_amount: bestDiscountValue,
        total_price: finalPrice
    };
}

// Calculate price before booking
app.post('/api/bookings/calculate', (req, res) => {
    const { facility_id, booking_date, time_slots } = req.body;
    if (!facility_id || !booking_date || !time_slots) return res.status(400).json({ error: "Missing fields" });

    let slots = [];
    try {
        slots = typeof time_slots === 'string' ? JSON.parse(time_slots) : time_slots;
    } catch(e) { return res.status(400).json({ error: "Invalid format" }); }

    db.get("SELECT base_price FROM facilities WHERE id = ?", [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, discounts) => {
            if (err) return res.status(500).json({ error: "DB Error" });
            const pricing = calculatePrice(facility, slots, discounts, booking_date);
            res.json(pricing);
        });
    });
});

app.post('/api/bookings', (req, res) => {
    const { facility_id, booking_date, time_slots } = req.body;
    
    // In a real app we would get the user_id from an auth token or session
    const user_id = req.session.userId || 1; 

    // Validate inputs
    if (!facility_id || !booking_date || !time_slots) {
        return res.status(400).json({ error: "Missing required booking information." });
    }

    let parsedNewSlots = [];
    try {
        parsedNewSlots = typeof time_slots === 'string' ? JSON.parse(time_slots) : time_slots;
        if (!Array.isArray(parsedNewSlots)) throw new Error("time_slots must be an array");
    } catch (e) {
        return res.status(400).json({ error: "Invalid time_slots format." });
    }

    // Secure Pricing Calculation
    db.get("SELECT base_price FROM facilities WHERE id = ?", [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, discounts) => {
            if (err) return res.status(500).json({ error: "DB Error" });
            
            const pricing = calculatePrice(facility, parsedNewSlots, discounts, booking_date);
            const secureTotalPrice = pricing.total_price;

            // 1. Check for existing overlapping bookings
            db.all(
                "SELECT time_slots FROM bookings WHERE facility_id = ? AND booking_date = ?",
                [facility_id, booking_date],
                (err, existingBookings) => {
                    if (err) return res.status(500).json({ error: "Database error during availability check." });

                    let allBookedSlots = [];
                    existingBookings.forEach(booking => {
                        try {
                            const slots = typeof booking.time_slots === 'string' 
                                ? JSON.parse(booking.time_slots) 
                                : booking.time_slots;
                            if (Array.isArray(slots)) {
                                allBookedSlots = allBookedSlots.concat(slots);
                            }
                        } catch (e) {}
                    });

                    // 2. Determine if there is an overlap
                    const hasConflict = parsedNewSlots.some(newSlot => allBookedSlots.includes(newSlot));

                    if (hasConflict) {
                        return res.status(409).json({ 
                            error: "Conflict: One or more selected time slots have already been booked." 
                        });
                    }

                    // 4. Proceed with booking
                    const slotsString = JSON.stringify(parsedNewSlots);
                    
                    db.run(
                        "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price) VALUES (?, ?, ?, ?, ?)",
                        [user_id, facility_id, booking_date, slotsString, secureTotalPrice],
                        function(insertErr) {
                            if (insertErr) {
                                return res.status(500).json({ error: insertErr.message });
                            }
                            res.status(201).json({ 
                                message: "Booking created successfully", 
                                booking_id: this.lastID,
                                total_price: secureTotalPrice
                            });
                        }
                    );
                }
            );
        });
    });
});

// Fallback for 404 Not Found
app.use((req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: "API Endpoint not found" });
    }
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
