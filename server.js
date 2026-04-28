const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
const db = require('./database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const emailService = require('./utils/emailService');

if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('FATAL: STRIPE_WEBHOOK_SECRET is not set. Exiting.');
    process.exit(1);
}

if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET is not set. Exiting.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', true);
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// Stripe webhook needs raw body
app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const rawBody = req.body;
    let event;
    try {
        event = stripe.webhooks.constructEvent(
            rawBody, 
            req.headers['stripe-signature'], 
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const metadata = session.metadata;
        
        try {
            if (metadata && metadata.checkout_token) {
                const row = await new Promise((resolve, reject) => {
                    db.get("SELECT payload FROM pending_checkouts WHERE id = ?", [metadata.checkout_token], (err, r) => {
                        if (err) reject(err); else resolve(r);
                    });
                });

                if (row) {
                    const payload = JSON.parse(row.payload);
                    const { user_id, facility_id, multi_day_slots } = payload;
                    const price = session.amount_total / 100;
                    const recurringGroupId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);

                    await db.transaction(async (client) => {
                        await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [facility_id]);
                        const datesArr = Object.keys(multi_day_slots);
                        const { rows: existingBookings } = await client.query(
                            `SELECT booking_date, time_slots FROM bookings WHERE facility_id = $1 AND booking_date = ANY($2::text[]) AND status != 'cancelled' FOR UPDATE`,
                            [facility_id, datesArr]
                        );

                        let hasConflict = false;
                        existingBookings.forEach(booking => {
                            try {
                                const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                                const newSlotsForDate = multi_day_slots[booking.booking_date] || [];
                                if (Array.isArray(slots) && newSlotsForDate.some(newSlot => slots.includes(newSlot))) {
                                    hasConflict = true;
                                }
                            } catch (e) {}
                        });

                        if (hasConflict) {
                            const err = new Error("Conflict: Time slots already booked.");
                            err.status = 409;
                            throw err;
                        }

                        for (const [date, slots] of Object.entries(multi_day_slots)) {
                            const slotsStr = JSON.stringify(slots);
                            const result = await client.query(
                                "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, payment_status, stripe_session_id, recurring_group_id) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'online', 'paid', $6, $7) RETURNING id",
                                [user_id, facility_id, date, slotsStr, price, session.id, recurringGroupId]
                            );
                            sendBookingEmails(result.rows[0].id);
                        }
                    });
                }
            } else if (metadata && metadata.facility_id) {
                const facilityId = metadata.facility_id;
                const bookingDate = metadata.booking_date;
                const timeSlotsStr = metadata.time_slots;
                const userId = metadata.user_id;
                const price = session.amount_total / 100;

                await db.transaction(async (client) => {
                    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text || '|' || $2::text)::bigint)", [facilityId, bookingDate]);
                    const { rows: existingBookings } = await client.query(
                        `SELECT time_slots FROM bookings WHERE facility_id = $1 AND booking_date = $2 AND status != 'cancelled' FOR UPDATE`,
                        [facilityId, bookingDate]
                    );

                    let hasConflict = false;
                    const newSlots = typeof timeSlotsStr === 'string' ? JSON.parse(timeSlotsStr) : timeSlotsStr;
                    existingBookings.forEach(booking => {
                        try {
                            const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                            if (Array.isArray(slots) && newSlots.some(ns => slots.includes(ns))) {
                                hasConflict = true;
                            }
                        } catch (e) {}
                    });

                    if (hasConflict) {
                        const err = new Error("Conflict: Time slots already booked.");
                        err.status = 409;
                        throw err;
                    }

                    const result = await client.query(
                        "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, payment_status, stripe_session_id) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'online', 'paid', $6) RETURNING id",
                        [userId, facilityId, bookingDate, typeof timeSlotsStr === 'string' ? timeSlotsStr : JSON.stringify(timeSlotsStr), price, session.id]
                    );
                    console.log("Booking confirmed via Stripe! ID:", result.rows[0].id);
                    sendBookingEmails(result.rows[0].id);
                });
            } else if (metadata && metadata.type === 'public_session_join') {
                const bookingId = metadata.booking_id;
                const userId = metadata.user_id;
                
                await new Promise((resolve, reject) => {
                    db.run(
                        "UPDATE public_session_participants SET payment_status = 'paid' WHERE booking_id = ? AND user_id = ? AND stripe_session_id = ?",
                        [bookingId, userId, session.id],
                        function(err) {
                            if (err) reject(err);
                            else {
                                console.log("Public session joined via Stripe! Booking ID:", bookingId);
                                sendPublicSessionJoinEmails(bookingId, userId);
                                resolve();
                            }
                        }
                    );
                });
            }
        } catch (e) {
            console.error("Webhook processing error:", e);
            if (e.status === 409) {
                return res.status(409).send("Conflict: Double booking detected.");
            }
            return res.status(500).send("Internal Server Error");
        }
    }
    
    res.status(200).send("Accepted");
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts. Try again in 15 minutes.' }
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/users/signup', authLimiter);
app.use('/api/reviews', authLimiter);
app.use('/api/create-checkout-session', authLimiter);
app.use('/api', generalLimiter);

// Session Middleware
app.use(session({
    store: new pgSession({
        pool: db.pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

// Serve static frontend files from current directory
app.use(express.static(path.join(__dirname)));

// API Routes
app.get('/api/config/maps', (req, res) => {
    // The Google Maps API key is referrer-restricted to gamegroundz.com origins
    // in Google Cloud Console, so this endpoint can be safely public.
    res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
});

// Helper to send emails
function sendBookingEmails(bookingId) {
    const query = `
        SELECT b.*, f.name as facility_name, f.location as facility_location, f.host_id,
               u.email as player_email, u.name as player_name,
               h.email as host_email, h.name as host_name
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN users h ON f.host_id = h.id
        WHERE b.id = ?
    `;
    db.get(query, [bookingId], (err, row) => {
        if (err || !row) return;
        emailService.sendPlayerConfirmation(row);
        emailService.sendHostConfirmation(row);
    });
}

function sendPublicSessionJoinEmails(bookingId, userId) {
    const q = `
        SELECT psp.quantity_adult, psp.quantity_kid, psp.booking_id,
               b.booking_date, b.time_slots, b.participant_price, b.participant_kid_price,
               f.name as facility_name, f.location as facility_location,
               u_host.name as host_name, u_host.email as host_email,
               u_player.name as player_name, u_player.email as player_email
        FROM public_session_participants psp
        JOIN bookings b ON psp.booking_id = b.id
        JOIN facilities f ON b.facility_id = f.id
        JOIN users u_host ON f.host_id = u_host.id
        JOIN users u_player ON psp.user_id = u_player.id
        WHERE psp.booking_id = ? AND psp.user_id = ? AND psp.payment_status = 'paid'
    `;
    db.get(q, [bookingId, userId], (err, row) => {
        if (err || !row) return;
        const total = (row.quantity_adult * (row.participant_price || 0)) + (row.quantity_kid * (row.participant_kid_price || 0));
        const emailDetails = {
            player_email: row.player_email,
            player_name: row.player_name,
            host_email: row.host_email,
            host_name: row.host_name,
            facility_name: row.facility_name,
            facility_location: row.facility_location,
            booking_date: row.booking_date,
            time_slots: row.time_slots,
            total_price: total,
            booking_id: row.booking_id
        };
        emailService.sendPlayerConfirmation(emailDetails);
        emailService.sendHostConfirmation(emailDetails);
    });
}

function sendPublicSessionCancelEmails(psp_id, cancelledBy) {
    const q = `
        SELECT psp.booking_id,
               b.booking_date, b.time_slots,
               f.name as facility_name,
               u_host.name as host_name, u_host.email as host_email,
               u_player.name as player_name, u_player.email as player_email
        FROM public_session_participants psp
        JOIN bookings b ON psp.booking_id = b.id
        JOIN facilities f ON b.facility_id = f.id
        JOIN users u_host ON f.host_id = u_host.id
        JOIN users u_player ON psp.user_id = u_player.id
        WHERE psp.id = ?
    `;
    db.get(q, [psp_id], (err, row) => {
        if (err || !row) return;
        const emailDetails = {
            player_email: row.player_email,
            player_name: row.player_name,
            host_email: row.host_email,
            host_name: row.host_name,
            facility_name: row.facility_name,
            booking_date: row.booking_date,
            time_slots: row.time_slots,
            booking_id: row.booking_id
        };
        emailService.sendCancellationEmail(emailDetails, cancelledBy);
    });
}

const getBookingDetailsForEmail = (bookingId) => {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT b.id as booking_id, b.booking_date, b.time_slots, b.total_price, 
                   f.name as facility_name, f.location as facility_location, f.host_id,
                   u.name as player_name, u.email as player_email,
                   h.name as host_name, h.email as host_email, h.company_name as host_company_name
            FROM bookings b
            JOIN facilities f ON b.facility_id = f.id
            JOIN users u ON b.user_id = u.id
            LEFT JOIN users h ON f.host_id = h.id
            WHERE b.id = ? 
        `;
        db.get(query, [bookingId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

// Review Request Polling (runs every 15 minutes)
setInterval(() => {
    db.all(`
        SELECT b.*, f.name as facility_name, u.name as player_name, u.email as player_email
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        JOIN users u ON b.user_id = u.id
        WHERE b.status = 'confirmed' AND b.review_email_sent = 0 AND b.booking_type = 'online'
    `, [], (err, bookings) => {
        if (err || !bookings) return;
        
        const serverNow = new Date();
        const tzStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' }); 
        const now = new Date(tzStr);

        bookings.forEach(booking => {
            try {
                const slots = JSON.parse(booking.time_slots);
                if (!slots || slots.length === 0) return;
                
                const sorted = [...slots].sort();
                const latestSlot = sorted[sorted.length - 1];
                let [hours, mins] = latestSlot.split(':').map(Number);
                mins += 30;
                if (mins >= 60) { hours += 1; mins -= 60; }
                
                // Date constructor with timezone assumption from standard formatting
                const endDateStr = `${booking.booking_date}T${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
                const endDate = new Date(endDateStr);
                
                if (isNaN(endDate.getTime())) return;
                
                const diffMs = now - endDate;
                const oneHourMs = 60 * 60 * 1000;
                
                // If it's been exactly or more than 1 hour since the booking ended
                if (diffMs >= oneHourMs) {
                    // Send review email
                    emailService.sendReviewRequest(booking);
                    
                    // Mark as sent
                    db.run("UPDATE bookings SET review_email_sent = 1 WHERE id = ?", [booking.id], (updateErr) => {
                        if (updateErr) console.error("Error updating review_email_sent:", updateErr);
                    });
                }
            } catch(e) {
                console.error("Error processing booking for review email:", e);
            }
        });
    });
}, 15 * 60 * 1000);

// --- AUTHENTICATION ---

// User Registration
app.post('/api/users/signup', async (req, res) => {
    try {
        let { first_name, last_name, phone_number, email, password, role_choice, company_name, profile_picture, residency_city, residency_document_url, interestedSurfaces } = req.body;
        
        if (!first_name || !last_name || !phone_number || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        if (role_choice === 'host' && !company_name) {
            return res.status(400).json({ error: "Company or city name is required for facility owner accounts" });
        }
        
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ error: "Password must be at least 8 characters long, and contain at least 1 number and 1 uppercase letter." });
        }
        
        email = email.trim().toLowerCase();
        let name = first_name.trim() + ' ' + last_name.trim();

        // Check if user already exists
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
            try {
                if (err) return res.status(500).json({ error: "Database error" });
                if (row) return res.status(400).json({ error: "User with this email already exists" });

                // Hash password
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                
                // Assign role based on choice, but preserve admin override based on email
                let userRole = role_choice === 'host' ? 'host' : 'player';
                const lowerEmail = email.toLowerCase();
                const adminEmails = (process.env.ADMIN_EMAILS || '')
                    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
                if (adminEmails.includes(lowerEmail)) {
                    userRole = 'admin';
                }

                // Residency default status
                let residency_status = 'none';
                let residency_applied_at = null;
                if (residency_city && residency_document_url) {
                    residency_status = 'pending';
                    residency_applied_at = new Date().toISOString();
                }

                // Handle interestedSurfaces
                let surfacesJSON = '[]';
                if (interestedSurfaces && Array.isArray(interestedSurfaces)) {
                    surfacesJSON = JSON.stringify(interestedSurfaces);
                }

                // Insert new user
                db.run("INSERT INTO users (name, email, password, role, company_name, first_name, last_name, phone_number, profile_picture, residency_city, residency_document_url, residency_status, residency_applied_at, interested_surfaces) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                    [name, email, hashedPassword, userRole, company_name, first_name.trim(), last_name.trim(), phone_number, profile_picture, residency_city || null, residency_document_url || null, residency_status, residency_applied_at, surfacesJSON], 
                    function(err) {
                        if (err) return res.status(500).json({ error: "Could not create user" });
                        
                        emailService.sendWelcomeEmail(email, name, userRole);
                        
                        // Set session
                        req.session.userId = this.lastID;
                        req.session.userRole = userRole;
                        req.session.userName = name;
                        req.session.email = email;
                        
                        res.status(201).json({ 
                            message: "User registered successfully", 
                            user: { id: this.lastID, name: name, email: email, role: userRole, profile_picture: profile_picture, residency_city, residency_status } 
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
        req.session.email = user.email;

        res.json({ 
            message: "Logged in successfully", 
            user: { id: user.id, name: user.name, email: user.email, role: user.role, profile_picture: user.profile_picture } 
        });
    });
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    email = email.trim().toLowerCase();

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(404).json({ error: "User not found" });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

        db.run("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)", [user.id, token, expiresAt], (err) => {
            if (err) return res.status(500).json({ error: "Could not generate reset token" });
            
            emailService.sendPasswordResetEmail(user.email, token);
            res.json({ message: "Password reset email sent" });
        });
    });
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    let { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: "Token and new password are required" });

    db.get("SELECT * FROM password_reset_tokens WHERE token = ?", [token], async (err, resetToken) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!resetToken) return res.status(400).json({ error: "Invalid or expired token" });

        if (new Date(resetToken.expires_at) < new Date()) {
            return res.status(400).json({ error: "Token has expired" });
        }
        db.get("SELECT password, email FROM users WHERE id = ?", [resetToken.user_id], async (err, user) => {
            if (err || !user) return res.status(500).json({ error: "Database error" });
            
            // Check if the new password matches the current one
            const isMatch = await bcrypt.compare(new_password, user.password);
            if (isMatch) {
                return res.status(400).json({ error: "New password cannot be the same as your current password" });
            }

            const hashedPassword = await bcrypt.hash(new_password, 10);
            
            db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, resetToken.user_id], (err) => {
                if (err) return res.status(500).json({ error: "Could not update password" });
                
                // Delete the used token
                db.run("DELETE FROM password_reset_tokens WHERE token = ?", [token]);
                
                // Send confirmation email
                if (user.email) {
                    emailService.sendPasswordChangedConfirmation(user.email);
                }
                
                res.json({ message: "Password updated successfully" });
            });
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
    
    db.get("SELECT id, name, first_name, last_name, email, phone_number, company_name, profile_picture, role, stripe_account_id, stripe_onboarding_complete, terms_accepted, terms_accepted_at, residency_city, residency_document_url, residency_status FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ user });
    });
});

// Update User Profile
// POST remove player's own residency
app.post('/api/users/residency/remove', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    
    db.run("UPDATE users SET residency_city = NULL, residency_status = NULL, residency_document_url = NULL, residency_applied_at = NULL WHERE id = ?", [req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Residency removed successfully." });
    });
});

app.put('/api/users/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    let { first_name, last_name, email, phone_number, company_name, profile_picture, old_password, new_password, residency_city, residency_document_url, interestedSurfaces } = req.body;
    
    if (!first_name || !last_name || !email || !phone_number) {
        return res.status(400).json({ error: "Missing required basic fields." });
    }

    email = email.trim().toLowerCase();
    let name = first_name.trim() + ' ' + last_name.trim();

    try {
        db.get("SELECT * FROM users WHERE id = ?", [req.session.userId], async (err, currentUser) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (!currentUser) return res.status(404).json({ error: "User not found" });

            // Ensure email isn't taken by someone else
            db.get("SELECT id FROM users WHERE email = ? AND id != ?", [email, req.session.userId], async (err, conflictUser) => {
                if (err) return res.status(500).json({ error: "Database error" });
                if (conflictUser) return res.status(400).json({ error: "Email is already in use by another account." });

                let finalPassword = currentUser.password;
                
                // If trying to change password
                if (old_password && new_password) {
                    const isMatch = await bcrypt.compare(old_password, currentUser.password);
                    if (!isMatch) {
                        return res.status(400).json({ error: "Incorrect current password." });
                    }
                    
                    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
                    if (!passwordRegex.test(new_password)) {
                        return res.status(400).json({ error: "New password must be at least 8 characters long, and contain at least 1 number and 1 uppercase letter." });
                    }
                    
                    const salt = await bcrypt.genSalt(10);
                    finalPassword = await bcrypt.hash(new_password, salt);
                }

                let finalResidencyCity = currentUser.residency_city;
                let finalResidencyUrl = currentUser.residency_document_url;
                let finalResidencyStatus = currentUser.residency_status;
                let finalResidencyAppliedAt = currentUser.residency_applied_at;

                if (residency_city !== undefined) {
                    finalResidencyCity = residency_city || null;
                    if (residency_document_url) {
                        finalResidencyUrl = residency_document_url;
                        finalResidencyStatus = 'pending';
                        finalResidencyAppliedAt = new Date().toISOString();
                    } else if (!residency_city) {
                        finalResidencyUrl = null;
                        finalResidencyStatus = 'none';
                        finalResidencyAppliedAt = null;
                    }
                }

                let finalInterestedSurfaces = currentUser.interested_surfaces;
                if (interestedSurfaces !== undefined) {
                    finalInterestedSurfaces = Array.isArray(interestedSurfaces) ? JSON.stringify(interestedSurfaces) : currentUser.interested_surfaces;
                }

                // Update the user
                db.run(
                    "UPDATE users SET name = ?, first_name = ?, last_name = ?, email = ?, phone_number = ?, company_name = ?, profile_picture = ?, password = ?, residency_city = ?, residency_document_url = ?, residency_status = ?, residency_applied_at = ?, interested_surfaces = ? WHERE id = ?",
                    [name, first_name.trim(), last_name.trim(), email, phone_number.trim(), company_name ? company_name.trim() : null, profile_picture || null, finalPassword, finalResidencyCity, finalResidencyUrl, finalResidencyStatus, finalResidencyAppliedAt, finalInterestedSurfaces, req.session.userId],
                    function(err) {
                        if (err) return res.status(500).json({ error: "Failed to update profile" });
                        
                        req.session.userName = name;
                        req.session.email = email;
                        res.status(200).json({ message: "Profile updated successfully" });
                    }
                );
            });
        });
    } catch (err) {
        res.status(500).json({ error: "Server error during profile update" });
    }
});


// GET all municipalities for residency verification
app.get('/api/municipalities', (req, res) => {
    db.all("SELECT id, name, location FROM facilities WHERE facility_type = 'Municipality / City' AND listing_status = 'approved' ORDER BY name ASC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Failed to fetch municipalities" });
        }
        res.json(rows);
    });
});

// GET and POST all facilities (with optional filtering)
app.all('/api/facilities', (req, res) => {
    const paramsSource = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
    const { type, types, environment, maxPrice, limit, offset, search } = paramsSource;
    
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
    
    if (req.query.search) {
        const primarySearchTerm = req.query.search.split(',')[0].trim();
        query += " AND (name ILIKE ? OR location ILIKE ? OR subtitle ILIKE ?)";
        params.push(`%${primarySearchTerm}%`, `%${primarySearchTerm}%`, `%${primarySearchTerm}%`);
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
         query += " ORDER BY sort_order ASC, id DESC";
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        const serverNow = new Date();
        const tzStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' }); 
        const tzDate = new Date(tzStr);

        const y = tzDate.getFullYear();
        const m = String(tzDate.getMonth() + 1).padStart(2, '0');
        const d = String(tzDate.getDate()).padStart(2, '0');
        const todayDateStr = `${y}-${m}-${d}`;

        const h = String(tzDate.getHours()).padStart(2, '0');
        const min = String(tzDate.getMinutes()).padStart(2, '0');
        const todayTimeStr = `${h}:${min}`;

        const targetDateStr = paramsSource.date || todayDateStr;
        const requestedTime = paramsSource.time || '';

        let dayOfWeek = '';
        if (targetDateStr === todayDateStr) {
            dayOfWeek = tzDate.toLocaleDateString('en-US', { weekday: 'long' });
        } else {
            const [ty, tm, td] = targetDateStr.split('-');
            const targetDateObj = new Date(parseInt(ty), parseInt(tm)-1, parseInt(td));
            dayOfWeek = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });
        }

        // Fetch active discounts to attach to facilities
        db.all("SELECT * FROM discounts WHERE is_active = 1", [], (err, discounts) => {
            const allDiscounts = discounts || [];
            
            // Fetch bookings for the target date
            db.all("SELECT facility_id, time_slots FROM bookings WHERE booking_date = ? AND status != 'cancelled'", [targetDateStr], (err, bookings) => {
                const bookedMap = {}; 
                (bookings || []).forEach(b => {
                    const fid = b.facility_id;
                    if (!bookedMap[fid]) bookedMap[fid] = new Set();
                    try {
                        const slots = JSON.parse(b.time_slots);
                        slots.forEach(s => bookedMap[fid].add(s));
                    } catch(e){}
                });

                let finalRows = [];

                rows.forEach(facility => {
                    // Attach applicable discounts
                    facility.discounts = allDiscounts.filter(dist => dist.facility_id === facility.id || dist.facility_id === null);
                    
                    // Determine if there is currently an active promotion for this facility today
                    const activeDiscounts = facility.discounts.filter(dist => {
                        const sdStr = dist.start_date ? (typeof dist.start_date === 'string' ? dist.start_date.split('T')[0] : dist.start_date.toISOString().split('T')[0]) : null;
                        const edStr = dist.end_date ? (typeof dist.end_date === 'string' ? dist.end_date.split('T')[0] : dist.end_date.toISOString().split('T')[0]) : null;

                        if (sdStr && sdStr > targetDateStr) return false;
                        if (edStr && edStr < targetDateStr) return false;
                        if (dist.recurring_day && dist.recurring_day !== dayOfWeek) return false;
                        if (dist.start_time && dist.end_time) {
                            if (targetDateStr === todayDateStr && todayTimeStr >= dist.end_time) return false; // Promotion ended for today
                        }
                        return true;
                    });
                    
                    facility.active_promotions = activeDiscounts.length > 0;

                    // Compute available slots
                    const availableSlots = [];
                    let opHours = { open: "06:00", close: "23:00" };
                    try {
                        if (facility.operating_hours) {
                            opHours = typeof facility.operating_hours === 'string' ? JSON.parse(facility.operating_hours) : facility.operating_hours;
                        }
                    } catch(e){}

                    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
                    if (isWeekend && opHours.weekend_open) {
                        opHours.open = opHours.weekend_open;
                        opHours.close = opHours.weekend_close || opHours.close;
                    }

                    const startHour = parseInt(opHours.open.split(':')[0], 10);
                    let endHour = parseInt(opHours.close.split(':')[0], 10);
                    if (endHour === 0 && opHours.close === "24:00") endHour = 24;
                    const fid = facility.id;
                    const bSet = bookedMap[fid] || new Set();

                    // Generate all 30 min slots
                    for (let hour = startHour; hour < endHour; hour++) {
                        const strH = hour.toString().padStart(2, '0');
                        const slot1 = `${strH}:00`;
                        const slot2 = `${strH}:30`;
                        
                        [slot1, slot2].forEach(slot => {
                            const isPast = (targetDateStr === todayDateStr) ? (slot <= todayTimeStr) : (targetDateStr < todayDateStr);
                            
                            if (!isPast && !bSet.has(slot)) {
                                let inTimeBlock = true;
                                if (requestedTime === 'morning') {
                                    inTimeBlock = (slot >= "00:00" && slot < "12:00");
                                } else if (requestedTime === 'afternoon') {
                                    inTimeBlock = (slot >= "12:00" && slot < "17:00");
                                } else if (requestedTime === 'night') {
                                    inTimeBlock = (slot >= "17:00" && slot <= "23:59");
                                }

                                if (inTimeBlock) {
                                    let hasDiscount = false;
                                    activeDiscounts.forEach(dist => {
                                        if (dist.start_time && dist.end_time) {
                                            if (slot >= dist.start_time && slot < dist.end_time) hasDiscount = true;
                                        } else {
                                            hasDiscount = true; // Full day discount
                                        }
                                    });
                                    availableSlots.push({ time: slot, discount: hasDiscount });
                                }
                            }
                        });
                    }

                    // Strict filtering
                    const isStrictSearch = !!(paramsSource.date || paramsSource.time);
                    if (isStrictSearch && availableSlots.length === 0) {
                        return; // Exclude this facility from final results
                    }

                    // Select up to 3 upcoming slots
                    facility.display_slots_today = availableSlots.slice(0, 3);
                    finalRows.push(facility);
                });
                
                res.json(finalRows);
            });
        });
    });
});

// GET single facility by ID
app.get('/api/facilities/:id', (req, res) => {
    const { id } = req.params;
    db.get(`
        SELECT f.*, u.name as host_name, u.company_name, u.profile_picture as host_profile_picture,
               (SELECT AVG(rating) FROM reviews WHERE facility_id = f.id) as computed_rating,
               (SELECT COUNT(*) FROM reviews WHERE facility_id = f.id) as computed_reviews_count
        FROM facilities f 
        LEFT JOIN users u ON f.host_id = u.id 
        WHERE f.id = ?
    `, [id], (err, row) => {
        if (err || !row) {
            return res.status(err ? 500 : 404).json({ error: err ? err.message : "Not found" });
        }
        
        row.rating = row.computed_reviews_count > 0 ? Number(row.computed_rating).toFixed(1) : '0.0';
        row.reviews_count = row.computed_reviews_count;

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [id], (err, discounts) => {
            if (!err) row.discounts = discounts;

            let connectedIds = [];
            try { connectedIds = JSON.parse(row.connected_facilities || '[]'); } catch(e){}
            
            if (connectedIds.length > 0) {
                const placeholders = connectedIds.map(() => '?').join(',');
                db.all(`SELECT id, name, type, image_url FROM facilities WHERE id IN (${placeholders}) AND listing_status = 'approved'`, connectedIds, (err, connected) => {
                    if (!err) row.connected_facilities_data = connected;
                    res.json(row);
                });
            } else {
                row.connected_facilities_data = [];
                res.json(row);
            }
        });
    });
});

// Helper to sync bi-directional connected facilities
function syncConnectedFacilities(subjectId, newConnections) {
    db.all(`SELECT id, connected_facilities FROM facilities`, [], (err, rows) => {
        if (err || !rows) return;
        
        const stringSubjectId = String(subjectId);
        const intSubjectId = parseInt(subjectId, 10);
        const shouldBeLinkedIds = newConnections.map(n => parseInt(n, 10));
        
        rows.forEach(row => {
            if (row.id == subjectId) return; // Skip self
            
            let changed = false;
            let linkedIds = [];
            try {
                linkedIds = JSON.parse(row.connected_facilities || '[]');
            } catch(e) {}
            
            const isCurrentlyLinked = linkedIds.includes(intSubjectId) || linkedIds.includes(stringSubjectId);
            const shouldBeLinked = shouldBeLinkedIds.includes(parseInt(row.id, 10));
            
            if (shouldBeLinked && !isCurrentlyLinked) {
                linkedIds = linkedIds.filter(id => String(id) !== stringSubjectId).concat([intSubjectId]);
                changed = true;
            } else if (!shouldBeLinked && isCurrentlyLinked) {
                linkedIds = linkedIds.filter(id => String(id) !== stringSubjectId);
                changed = true;
            }
            
            if (changed) {
                db.run(`UPDATE facilities SET connected_facilities = ? WHERE id = ?`, [JSON.stringify(linkedIds), row.id]);
            }
        });
    });
}

// POST a new facility
app.post('/api/facilities', (req, res) => {
    // Check if user is authenticated (backend guard)
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized: You must be logged in to list a facility." });
    }

    const { name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, facility_type, environment, base_price, pricing_rules, location, lat, lng, image_url, is_instant_book, operating_hours, listing_status, advance_booking_days, has_processing_fee, processing_fee_amount, connected_facilities, pricing_unit } = req.body;
    
    if (!name || !type || !environment || !base_price || !location || !image_url) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    let rulesStr = '[]';
    let featuresStr = '[]';
    let amenitiesStr = '[]';
    let hoursStr = '{"open": "06:00", "close": "23:00"}';
    let connectedFacilitiesStr = '[]';
    
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
    if (connected_facilities && Array.isArray(connected_facilities)) {
        connectedFacilitiesStr = JSON.stringify(connected_facilities);
    }

    const statusToSave = listing_status || 'pending';

    db.run(
        `INSERT INTO facilities 
         (name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, facility_type, environment, base_price, pricing_rules, location, lat, lng, image_url, is_instant_book, host_id, operating_hours, listing_status, advance_booking_days, has_processing_fee, processing_fee_amount, connected_facilities, pricing_unit) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, facility_type || 'Other', environment, base_price, rulesStr, location, lat || null, lng || null, image_url, is_instant_book ? 1 : 0, req.session.userId, hoursStr, statusToSave, advance_booking_days ? parseInt(advance_booking_days, 10) : 180, has_processing_fee !== undefined ? (has_processing_fee ? 1 : 0) : 1, processing_fee_amount !== undefined ? parseFloat(processing_fee_amount) : 15.00, connectedFacilitiesStr, pricing_unit || 'hour'],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (Array.isArray(connected_facilities)) {
                syncConnectedFacilities(this.lastID, connected_facilities);
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
    const { name, subtitle, description, features, locker_rooms, capacity, size_info, amenities, type, facility_type, environment, base_price, pricing_rules, location, lat, lng, image_url, is_instant_book, operating_hours, listing_status, advance_booking_days, has_processing_fee, processing_fee_amount, connected_facilities, pricing_unit } = req.body;
    
    if (!name || !type || !environment || !base_price || !location || !image_url) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    let rulesStr = '[]';
    let featuresStr = '[]';
    let amenitiesStr = '[]';
    let hoursStr = '{"open": "06:00", "close": "23:00"}';
    let connectedFacilitiesStr = '[]';
    
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
    if (connected_facilities && Array.isArray(connected_facilities)) {
        connectedFacilitiesStr = JSON.stringify(connected_facilities);
    }

    const statusToSave = listing_status || 'pending';

    // Include host_id in the WHERE clause so users can only edit their own facilities
    db.run(
        `UPDATE facilities SET 
            name = ?, subtitle = ?, description = ?, features = ?, locker_rooms = ?, 
            capacity = ?, size_info = ?, amenities = ?, type = ?, facility_type = ?, environment = ?, 
            base_price = ?, pricing_rules = ?, location = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), image_url = ?, 
            is_instant_book = ?, operating_hours = ?, listing_status = ?, advance_booking_days = ?, has_processing_fee = ?, processing_fee_amount = ?, connected_facilities = ?, pricing_unit = ? 
         WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)`,
        [name, subtitle || '', description || '', featuresStr, locker_rooms || 0, capacity || 0, size_info || '', amenitiesStr, type, facility_type || 'Other', environment, base_price, rulesStr, location, lat || null, lng || null, image_url, is_instant_book ? 1 : 0, hoursStr, statusToSave, advance_booking_days ? parseInt(advance_booking_days, 10) : 180, has_processing_fee !== undefined ? (has_processing_fee ? 1 : 0) : 1, processing_fee_amount !== undefined ? parseFloat(processing_fee_amount) : 15.00, connectedFacilitiesStr, pricing_unit || 'hour', facilityId, req.session.userId, `%"${req.session.email}"%` ],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "Facility not found or you do not have permission to edit it." });
            }
            
            if (Array.isArray(connected_facilities)) {
                syncConnectedFacilities(facilityId, connected_facilities);
            }

            res.status(200).json({ message: "Facility updated successfully" });
        }
    );
});

// POST a co-host email
app.post('/api/host/facilities/:id/co-hosts', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const facilityId = req.params.id;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    const targetEmail = email.trim().toLowerCase();

    db.get("SELECT name, co_host_emails FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facilityId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Facility not found or unauthorized" });

        let emails = [];
        try { emails = JSON.parse(row.co_host_emails || '[]'); } catch(e){}
        if (!emails.includes(targetEmail)) {
            emails.push(targetEmail);
            db.run("UPDATE facilities SET co_host_emails = ? WHERE id = ?", [JSON.stringify(emails), facilityId], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: "Could not add co-host" });
                emailService.sendCoHostInvitationEmail(targetEmail, row.name, req.session.userName);
                res.json({ message: "Co-host added successfully", emails });
            });
        } else {
            res.json({ message: "Co-host already exists", emails });
        }
    });
});

// GET co-hosts
app.get('/api/host/facilities/:id/co-hosts', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const facilityId = req.params.id;
    db.get("SELECT co_host_emails FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facilityId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        let emails = [];
        try { emails = JSON.parse(row.co_host_emails || '[]'); } catch(e){}
        res.json({ emails });
    });
});

// DELETE co-host
app.delete('/api/host/facilities/:id/co-hosts/:email', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const facilityId = req.params.id;
    const emailToRemove = req.params.email.trim().toLowerCase();

    db.get("SELECT co_host_emails FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facilityId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        
        let emails = [];
        try { emails = JSON.parse(row.co_host_emails || '[]'); } catch(e){}
        
        emails = emails.filter(e => e !== emailToRemove);
        
        db.run("UPDATE facilities SET co_host_emails = ? WHERE id = ?", [JSON.stringify(emails), facilityId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Could not remove co-host" });
            res.json({ message: "Co-host removed", emails });
        });
    });
});

// GET residency applications for host's municipalities
app.get('/api/host/residency-applications', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const query = `
        SELECT u.id as player_id, u.name as player_name, u.email, u.phone_number, u.residency_document_url, u.residency_status, u.residency_applied_at, f.name as facility_name
        FROM users u
        JOIN facilities f ON u.residency_city = f.location
        WHERE f.host_id = ? AND f.facility_type = 'Municipality / City'
        ORDER BY u.residency_applied_at DESC
    `;
    db.all(query, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// POST approve residency
app.post('/api/host/residency-applications/:player_id/approve', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const playerId = req.params.player_id;
    db.get("SELECT u.id FROM users u JOIN facilities f ON u.residency_city = f.location WHERE u.id = ? AND f.host_id = ?", [playerId, req.session.userId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Not authorized" });
        
        db.run("UPDATE users SET residency_status = 'verified' WHERE id = ?", [playerId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Player residency verified." });
        });
    });
});

// POST reject residency
app.post('/api/host/residency-applications/:player_id/reject', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const playerId = req.params.player_id;
    db.get("SELECT u.id FROM users u JOIN facilities f ON u.residency_city = f.location WHERE u.id = ? AND f.host_id = ?", [playerId, req.session.userId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Not authorized" });
        
        db.run("UPDATE users SET residency_status = 'rejected' WHERE id = ?", [playerId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Database error" });
        });
    });
});

// POST remove residency (completely disconnects the user from municipality)
app.post('/api/host/residency-applications/:player_id/remove', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const playerId = req.params.player_id;
    db.get("SELECT u.id FROM users u JOIN facilities f ON u.residency_city = f.location WHERE u.id = ? AND f.host_id = ?", [playerId, req.session.userId], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Not authorized" });
        
        db.run("UPDATE users SET residency_city = NULL, residency_status = NULL, residency_document_url = NULL, residency_applied_at = NULL WHERE id = ?", [playerId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Player residency completely removed." });
        });
    });
});

// GET all facilities for the logged-in host
app.get('/api/host/facilities', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    db.all("SELECT * FROM facilities WHERE host_id = ? OR co_host_emails LIKE ? ORDER BY sort_order ASC, id DESC", [req.session.userId, `%"${req.session.email}"%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// PUT reorder facilities
app.put('/api/host/facilities/reorder', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds)) return res.status(400).json({ error: "Invalid order array" });
    
    if (orderIds.length === 0) return res.json({ message: "No change" });
    
    try {
        for (let i = 0; i < orderIds.length; i++) {
            const parsedId = parseInt(orderIds[i], 10);
            await new Promise((resolve, reject) => {
                db.run("UPDATE facilities SET sort_order = ? WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", 
                [i, parsedId, req.session.userId, `%"${req.session.email}"%`], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        res.json({ message: "Reordered successfully" });
    } catch (err) {
        console.error("Error updating sort_order:", err);
        res.status(500).json({ error: "Error updating some facilities" });
    }
});

// GET unread host notifications count
app.get('/api/host/notifications/unread-count', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const query = `
        SELECT COUNT(*) as count 
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.is_read = 0
    `;
    
    db.get(query, [req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ unread_count: row.count || 0 });
    });
});

// POST mark host notifications as read
app.post('/api/host/notifications/mark-read', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const query = `
        UPDATE bookings 
        SET is_read = 1 
        WHERE id IN (
            SELECT b.id FROM bookings b 
            JOIN facilities f ON b.facility_id = f.id 
            WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.is_read = 0
        )
    `;
    
    db.run(query, [req.session.userId, `%"${req.session.email}"%`], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Notifications marked as read" });
    });
});

// GET all bookings for the logged-in host's facilities
app.get('/api/host/bookings', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    const query = `
        SELECT b.*, f.name as facility_name, u.name as player_name, u.email as player_email, u.phone_number as player_phone_number,
        (SELECT COALESCE(SUM(quantity), 0) FROM public_session_participants WHERE booking_id = b.id AND payment_status = 'paid') as joined_count
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN users u ON b.user_id = u.id
        WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.status != 'cancelled'
        ORDER BY b.booking_date ASC, b.time_slots ASC
    `;
    
    db.all(query, [req.session.userId, `%"${req.session.email}"%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET today's dispatch data for the logged-in host
app.get('/api/host/dispatch-data', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];
    
    const query = `
        SELECT b.id, b.facility_id, b.booking_date, b.time_slots, b.booking_type, b.manual_notes, b.locker_room_assignment, f.name as facility_name
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE (f.host_id = ? OR f.co_host_emails LIKE ?) AND b.booking_date = ? AND b.status != 'cancelled'
        ORDER BY f.sort_order ASC, f.id DESC, b.time_slots ASC
    `;
    
    db.all(query, [req.session.userId, `%"${req.session.email}"%`, targetDate], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Group by facility
        const dispatchData = {};
        rows.forEach(b => {
            if (!dispatchData[b.facility_name]) {
                dispatchData[b.facility_name] = [];
            }
            dispatchData[b.facility_name].push(b);
        });
        
        res.json(dispatchData);
    });
});

// POST a manual time block (offline reservation)
app.post('/api/host/block-time', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { facility_id, booking_date, time_slots, manual_notes, repeat_option, repeat_until, repeat_days, booking_type, capacity, participant_price, participant_kid_price, residents_only, locker_room_assignment } = req.body;
    
    if (!facility_id || !booking_date || !time_slots || !manual_notes) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    const typeToUse = booking_type === 'public_session' ? 'public_session' : 'manual';
    const capToUse = typeToUse === 'public_session' ? parseInt(capacity, 10) || 0 : 0;
    const priceToUse = typeToUse === 'public_session' ? parseFloat(participant_price) || 0.0 : 0.0;
    const kidPriceToUse = typeToUse === 'public_session' ? parseFloat(participant_kid_price) || 0.0 : 0.0;
    const resOnlyToUse = typeToUse === 'public_session' ? (residents_only ? 1 : 0) : 0;

    // Verify this facility belongs to the logged-in host
    db.get("SELECT id FROM facilities WHERE id = ? AND host_id = ?", [facility_id, req.session.userId], async (err, facility) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!facility) return res.status(403).json({ error: "Forbidden: You do not own this facility." });

        // Generate dates
        let datesToBook = [];
        let recurringGroupId = null;
        
        if (repeat_option && repeat_option !== 'none' && repeat_until) {
            recurringGroupId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const startDate = new Date(booking_date + 'T00:00:00');
            const endDate = new Date(repeat_until + 'T23:59:59');
            let currentDate = new Date(startDate);
            
            // Ensure starting day is correctly bounded
            const validDays = Array.isArray(repeat_days) && repeat_days.length > 0 ? repeat_days : [startDate.getDay()];

            while (currentDate <= endDate) {
                if (repeat_option === 'daily') {
                    datesToBook.push(currentDate.toISOString().split('T')[0]);
                } else if (repeat_option === 'weekly') {
                    if (validDays.includes(currentDate.getDay())) {
                        datesToBook.push(currentDate.toISOString().split('T')[0]);
                    }
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            // No repeat, just book the single date
            datesToBook.push(booking_date);
        }
        
        const sql = `
            INSERT INTO bookings (facility_id, booking_date, time_slots, total_price, status, booking_type, manual_notes, recurring_group_id, capacity, participant_price, participant_kid_price, residents_only, locker_room_assignment)
            VALUES ($1, $2, $3, 0, 'confirmed', $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        
        try {
            await db.transaction(async (client) => {
                const lockKeyQuery = datesToBook.length > 1 
                    ? "SELECT pg_advisory_xact_lock($1::bigint)" 
                    : "SELECT pg_advisory_xact_lock(hashtext($1::text || '|' || $2::text)::bigint)";
                
                if (datesToBook.length > 1) {
                    await client.query(lockKeyQuery, [facility_id]);
                } else {
                    await client.query(lockKeyQuery, [facility_id, datesToBook[0]]);
                }

                const { rows: existingBookings } = await client.query(
                    `SELECT booking_date, time_slots FROM bookings WHERE facility_id = $1 AND booking_date = ANY($2::text[]) AND status != 'cancelled' FOR UPDATE`,
                    [facility_id, datesToBook]
                );

                let hasConflict = false;
                const newSlots = Array.isArray(time_slots) ? time_slots : [time_slots];
                existingBookings.forEach(booking => {
                    try {
                        const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                        if (Array.isArray(slots) && newSlots.some(newSlot => slots.includes(newSlot))) {
                            hasConflict = true;
                        }
                    } catch (e) {}
                });

                if (hasConflict) {
                    const err = new Error("Conflict: Time slots already booked.");
                    err.status = 409;
                    throw err;
                }

                for (const dateStr of datesToBook) {
                    await client.query(sql, [facility_id, dateStr, JSON.stringify(time_slots), typeToUse, manual_notes, recurringGroupId, capToUse, priceToUse, kidPriceToUse, resOnlyToUse, locker_room_assignment || '']);
                }
            });

            res.status(201).json({ message: `Successfully created ${datesToBook.length} booking(s)` });
        } catch (err) {
            console.error("Booking insert error:", err);
            if (err.status === 409) return res.status(409).json({ error: err.message });
            res.status(500).json({ error: "Failed to create some or all bookings" });
        }
    });
});

// PUT (Edit) a booking
app.put('/api/host/bookings/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const bookingId = req.params.id;
    const { booking_date, time_slots, manual_notes, repeat_option, repeat_until, repeat_days, booking_type, capacity, participant_price, participant_kid_price, residents_only, locker_room_assignment } = req.body;

    if (!booking_date || !time_slots) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Process public session fields securely
    const isPublic = booking_type === 'public_session';
    const numCap = isPublic ? (parseInt(capacity, 10) || 0) : 0;
    const numPrice = isPublic ? (parseFloat(participant_price) || 0.0) : 0.0;
    const numKidPrice = isPublic ? (parseFloat(participant_kid_price) || 0.0) : 0.0;
    const reqResOnly = isPublic ? (residents_only ? 1 : 0) : 0;

    // Verify ownership via facilities table
    db.get(
        `SELECT b.id, b.facility_id, b.recurring_group_id FROM bookings b 
         JOIN facilities f ON b.facility_id = f.id 
         WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)`,
        [bookingId, req.session.userId, `%"${req.session.email}"%`],
        async (err, row) => {
            if (err || !row) return res.status(403).json({ error: "Access denied or booking not found" });

            let recurringGroupId = row.recurring_group_id;
            let datesToBook = [];
            
            if (repeat_option && repeat_option !== 'none' && repeat_until) {
                if (!recurringGroupId) {
                    recurringGroupId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                }
                const startDate = new Date(booking_date + 'T00:00:00');
                const endDate = new Date(repeat_until + 'T23:59:59');
                let currentDate = new Date(startDate);
                
                const validDays = Array.isArray(repeat_days) && repeat_days.length > 0 ? repeat_days : [startDate.getDay()];

                while (currentDate <= endDate) {
                    const dateStr = currentDate.toISOString().split('T')[0];
                    if (dateStr !== booking_date) {
                        if (repeat_option === 'daily') {
                            datesToBook.push(dateStr);
                        } else if (repeat_option === 'weekly') {
                            if (validDays.includes(currentDate.getDay())) {
                                datesToBook.push(dateStr);
                            }
                        }
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                }
            }

            const allDatesToCheck = [booking_date, ...datesToBook];
            
            try {
                await db.transaction(async (client) => {
                    const lockKeyQuery = allDatesToCheck.length > 1 
                        ? "SELECT pg_advisory_xact_lock($1::bigint)" 
                        : "SELECT pg_advisory_xact_lock(hashtext($1::text || '|' || $2::text)::bigint)";
                    
                    if (allDatesToCheck.length > 1) {
                        await client.query(lockKeyQuery, [row.facility_id]);
                    } else {
                        await client.query(lockKeyQuery, [row.facility_id, booking_date]);
                    }

                    const { rows: existingBookings } = await client.query(
                        `SELECT id, booking_date, time_slots FROM bookings WHERE facility_id = $1 AND booking_date = ANY($2::text[]) AND status != 'cancelled' FOR UPDATE`,
                        [row.facility_id, allDatesToCheck]
                    );

                    let hasConflict = false;
                    const newSlots = Array.isArray(time_slots) ? time_slots : [time_slots];
                    existingBookings.forEach(booking => {
                        if (booking.id == bookingId) return;
                        
                        try {
                            const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                            if (Array.isArray(slots) && newSlots.some(newSlot => slots.includes(newSlot))) {
                                hasConflict = true;
                            }
                        } catch (e) {}
                    });

                    if (hasConflict) {
                        const err = new Error("Conflict: Time slots already booked.");
                        err.status = 409;
                        throw err;
                    }

                    const updateSql = `
                        UPDATE bookings 
                        SET booking_date = $1, time_slots = $2, manual_notes = COALESCE($3, manual_notes), recurring_group_id = COALESCE($4, recurring_group_id),
                            capacity = COALESCE($5, capacity), participant_price = COALESCE($6, participant_price), participant_kid_price = COALESCE($7, participant_kid_price), residents_only = COALESCE($8, residents_only), locker_room_assignment = COALESCE($9, locker_room_assignment)
                        WHERE id = $10
                    `;
                    await client.query(updateSql, [booking_date, JSON.stringify(time_slots), manual_notes, recurringGroupId, numCap, numPrice, numKidPrice, reqResOnly, locker_room_assignment, bookingId]);

                    if (datesToBook.length > 0) {
                        const bTypeStr = isPublic ? 'public_session' : 'manual';
                        const insertSql = `
                            INSERT INTO bookings (facility_id, booking_date, time_slots, total_price, status, booking_type, manual_notes, recurring_group_id, capacity, participant_price, participant_kid_price, residents_only, locker_room_assignment)
                            VALUES ($1, $2, $3, 0, 'confirmed', $4, $5, $6, $7, $8, $9, $10, $11)
                        `;
                        for (const d of datesToBook) {
                            await client.query(insertSql, [row.facility_id, d, JSON.stringify(time_slots), bTypeStr, manual_notes, recurringGroupId, numCap, numPrice, numKidPrice, reqResOnly, locker_room_assignment || '']);
                        }
                    }
                });
                
                if (datesToBook.length > 0) {
                    res.status(200).json({ message: "Booking updated and series extended successfully" });
                } else {
                    res.status(200).json({ message: "Booking updated successfully" });
                }
            } catch (err) {
                console.error("Booking update error:", err);
                if (err.status === 409) return res.status(409).json({ error: err.message });
                res.status(500).json({ error: "Failed to update booking" });
            }
        }
    );
});

// PATCH (Edit Locker Room) a booking
app.patch('/api/host/bookings/:id/locker-room', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const bookingId = req.params.id;
    const { locker_room_assignment } = req.body;

    db.get(
        `SELECT b.id FROM bookings b 
         JOIN facilities f ON b.facility_id = f.id 
         WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)`,
        [bookingId, req.session.userId, `%"${req.session.email}"%`],
        (err, row) => {
            if (err || !row) return res.status(403).json({ error: "Access denied" });
            db.run("UPDATE bookings SET locker_room_assignment = ? WHERE id = ?", [locker_room_assignment || '', bookingId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(200).json({ message: "Locker room assigned successfully" });
            });
        }
    );
});

// GET all bookings for current user
app.get('/api/bookings/my', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    const user_id = req.session.userId;

    // Join with facilities to get facility name and image
    const query = `
        SELECT b.id, b.user_id, b.facility_id, b.booking_date, b.time_slots, b.total_price, b.status, b.booking_type, b.manual_notes, b.payment_status, b.stripe_session_id, b.review_email_sent, b.recurring_group_id, b.is_read, b.is_archived, b.capacity, b.participant_price, f.name as facility_name, f.image_url, f.location, 1 as quantity
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.user_id = ? AND b.booking_type != 'public_session' AND b.status != 'cancelled'
        UNION ALL
        SELECT b.id, psp.user_id, b.facility_id, b.booking_date, b.time_slots, (psp.quantity * b.participant_price) as total_price, b.status, b.booking_type, b.manual_notes, psp.payment_status, psp.stripe_session_id, b.review_email_sent, b.recurring_group_id, b.is_read, b.is_archived, b.capacity, b.participant_price, f.name as facility_name, f.image_url, f.location, psp.quantity
        FROM public_session_participants psp
        JOIN bookings b ON psp.booking_id = b.id
        JOIN facilities f ON b.facility_id = f.id
        WHERE psp.user_id = ? AND psp.payment_status = 'paid' AND b.status != 'cancelled'
        ORDER BY booking_date DESC
    `;

    db.all(query, [user_id, user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET bookings for a facility (e.g. to block out times)
app.get('/api/bookings/:facility_id', (req, res) => {
    const { facility_id } = req.params;
    const { date } = req.query;
    
    let query = `
        SELECT b.*, 
        (SELECT COALESCE(SUM(quantity), 0) FROM public_session_participants WHERE booking_id = b.id AND payment_status = 'paid') as joined_count
        FROM bookings b WHERE facility_id = ?
    `;
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

// GET public sessions for a facility
app.get('/api/public_sessions/:facility_id', (req, res) => {
    const { facility_id } = req.params;
    
    // We only want future public sessions or today's
    const query = `
        SELECT b.*, 
        (SELECT COALESCE(SUM(quantity), 0) FROM public_session_participants WHERE booking_id = b.id AND payment_status = 'paid') as joined_count
        FROM bookings b 
        WHERE b.facility_id = ? AND b.booking_type = 'public_session' AND b.status = 'confirmed' 
        AND (b.booking_date >= date('now', 'localtime') OR b.booking_date >= CURRENT_DATE)
        ORDER BY b.booking_date ASC, b.time_slots ASC
    `;
    
    db.all(query, [facility_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST join a public session
app.post('/api/public_sessions/join', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "You must be logged in to join a public session." });
    }

    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });

    // Validate the session exists and has capacity
    const query = `
        SELECT b.*, f.name as facility_name, f.location as facility_location, f.image_url, u.stripe_account_id,
        (SELECT COALESCE(SUM(quantity), 0) FROM public_session_participants WHERE booking_id = b.id AND payment_status = 'paid') as joined_count
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN users u ON f.host_id = u.id
        WHERE b.id = ? AND b.booking_type = 'public_session'
    `;

    db.get(query, [booking_id], async (err, session) => {
        if (err || !session) return res.status(404).json({ error: "Session not found." });

        if (session.residents_only) {
            const user = await new Promise((resolve) => {
                db.get("SELECT residency_city, residency_status FROM users WHERE id = ?", [req.session.userId], (err, row) => resolve(row));
            });
            if (!user || !user.residency_city || user.residency_city.trim().toLowerCase() !== session.facility_location.trim().toLowerCase() || user.residency_status !== 'verified') {
                return res.status(403).json({ error: "This session is reserved for verified residents of this municipality." });
            }
        }

        const reqAdultQty = parseInt(req.body.adultQuantity, 10) || parseInt(req.body.quantity, 10) || 0;
        const reqKidQty = parseInt(req.body.kidQuantity, 10) || 0;
        const reqTotalQty = reqAdultQty + reqKidQty;

        if (reqTotalQty < 1 || reqTotalQty > 100) {
            return res.status(400).json({ error: "Invalid quantity. You must book at least 1 spot." });
        }

        const joinedCountNum = parseInt(session.joined_count, 10) || 0;
        const capacityNum = parseInt(session.capacity, 10) || 0;

        if (joinedCountNum + reqTotalQty > capacityNum) {
            return res.status(400).json({ error: `Not enough spots remaining in this session. (${capacityNum - joinedCountNum} left)` });
        }
        
        // Also check if user already joined
        db.get("SELECT id FROM public_session_participants WHERE booking_id = ? AND user_id = ? AND payment_status = 'paid'", [booking_id, req.session.userId], async (err, existing) => {
            if (existing) {
                return res.status(400).json({ error: "You have already joined this session." });
            }

            // Create checkout
            try {
                // Determine application fee (e.g. 10%)
                const feePercentage = 0.10;
                let unitAmountAdult = Math.round(session.participant_price * 100);
                let unitAmountKid = Math.round((session.participant_kid_price || 0) * 100);
                
                const totalAmount = (unitAmountAdult * reqAdultQty) + (unitAmountKid * reqKidQty);
                
                let line_items = [];
                if (reqAdultQty > 0) {
                    line_items.push({
                        price_data: {
                            currency: 'cad',
                            product_data: {
                                name: `Public Session (Adult): ${session.manual_notes || 'Open Session'}`,
                                description: `${session.facility_name} - ${session.booking_date}`,
                            },
                            unit_amount: unitAmountAdult,
                        },
                        quantity: reqAdultQty,
                    });
                }
                if (reqKidQty > 0) {
                    line_items.push({
                        price_data: {
                            currency: 'cad',
                            product_data: {
                                name: `Public Session (Kid): ${session.manual_notes || 'Open Session'}`,
                                description: `${session.facility_name} - ${session.booking_date}`,
                            },
                            unit_amount: unitAmountKid,
                        },
                        quantity: reqKidQty,
                    });
                }

                let sessionParams = {
                    payment_method_types: ['card'],
                    mode: 'payment',
                    success_url: `${process.env.APP_URL || 'http://localhost:3000'}/player-dashboard.html?session_joined=success&session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/facility.html?id=${session.facility_id}&session_joined=cancel`,
                    client_reference_id: req.session.userId.toString(),
                    metadata: {
                        booking_id: booking_id.toString(),
                        user_id: req.session.userId.toString(),
                        type: 'public_session_join',
                        quantity: reqTotalQty.toString(),
                        quantity_adult: reqAdultQty.toString(),
                        quantity_kid: reqKidQty.toString()
                    },
                    line_items: line_items
                };

                // Add transfer data if the host has stripe connected
                if (session.stripe_account_id && totalAmount > 0) {
                    const hostAmount = Math.round(totalAmount * (1 - feePercentage));
                    if (hostAmount > 0) {
                        sessionParams.payment_intent_data = {
                            application_fee_amount: totalAmount - hostAmount,
                            transfer_data: {
                                destination: session.stripe_account_id,
                            },
                        };
                    }
                }

                // If total price is 0, we bypass stripe and just insert them as Paid!
                if (totalAmount === 0) {
                    db.run("INSERT INTO public_session_participants (booking_id, user_id, payment_status, quantity, quantity_adult, quantity_kid) VALUES (?, ?, 'paid', ?, ?, ?)", [booking_id, req.session.userId, reqTotalQty, reqAdultQty, reqKidQty], function(err) {
                         if (err) return res.status(500).json({ error: "Failed to join." });
                         return res.json({ freeJoin: true, redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/player-dashboard.html?session_joined=success` });
                    });
                    return;
                }

                const stripeSession = await stripe.checkout.sessions.create(sessionParams);

                // Create a pending participant record
                db.run("INSERT INTO public_session_participants (booking_id, user_id, payment_status, stripe_session_id, quantity, quantity_adult, quantity_kid) VALUES (?, ?, 'pending', ?, ?, ?, ?)", 
                    [booking_id, req.session.userId, stripeSession.id, reqTotalQty, reqAdultQty, reqKidQty], function(err) {
                    if (err) {
                        console.error('Participant insert err:', err);
                        return res.status(500).json({ error: "Failed to initialize checkout." });
                    }
                    res.json({ url: stripeSession.url });
                });

            } catch (error) {
                console.error("Stripe error:", error);
                res.status(500).json({ error: error.message });
            }
        });
    });
});

app.get('/api/public_sessions/:booking_id/participants', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    const { booking_id } = req.params;
    
    // Check if the current user is the host of this facility
    const authQuery = `
        SELECT b.id 
        FROM bookings b 
        JOIN facilities f ON b.facility_id = f.id 
        WHERE b.id = ? AND f.host_id = ?
    `;
    db.get(authQuery, [booking_id, req.session.userId], (err, authRow) => {
        if (err || !authRow) return res.status(403).json({ error: "Not authorized" });
        
        const q = `
            SELECT psp.id, psp.quantity, psp.quantity_adult, psp.quantity_kid, psp.created_at, u.name, u.email 
            FROM public_session_participants psp
            JOIN users u ON psp.user_id = u.id
            WHERE psp.booking_id = ? AND psp.payment_status = 'paid'
            ORDER BY psp.created_at DESC
        `;
        db.all(q, [booking_id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
});

app.post('/api/host/public_sessions/:booking_id/participants/:psp_id/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
    const { booking_id, psp_id } = req.params;

    // Check if the current user is the host of this facility
    const authQuery = `
        SELECT b.id 
        FROM bookings b 
        JOIN facilities f ON b.facility_id = f.id 
        WHERE b.id = ? AND f.host_id = ?
    `;
    db.get(authQuery, [booking_id, req.session.userId], (err, authRow) => {
        if (err || !authRow) return res.status(403).json({ error: "Not authorized" });
        
        // Fetch participant detail
        db.get(`SELECT id, payment_status, stripe_session_id FROM public_session_participants WHERE id = ? AND booking_id = ?`, [psp_id, booking_id], async (err, pspRow) => {
            if (err || !pspRow) return res.status(404).json({ error: "Participant not found." });
            
            if (pspRow.payment_status !== 'paid') {
                return res.status(400).json({ error: "Only paid participants can be removed." });
            }

            try {
                // If there's a stripe session ID, attempt refund
                if (pspRow.stripe_session_id) {
                    const session = await stripe.checkout.sessions.retrieve(pspRow.stripe_session_id);
                    if (session && session.payment_intent) {
                        await stripe.refunds.create(
                            { payment_intent: session.payment_intent },
                            { idempotencyKey: `refund-booking-${booking_id}` }
                        );
                    }
                }

                // Update participant to refunded
                db.run("UPDATE public_session_participants SET payment_status = 'refunded' WHERE id = ?", [psp_id], (updateErr) => {
                    if (updateErr) return res.status(500).json({ error: "Failed to update participant status." });
                    sendPublicSessionCancelEmails(psp_id, 'host');
                    res.json({ success: true, message: "Participant removed and refunded successfully." });
                });

            } catch (error) {
                console.error("Stripe refund error:", error);
                res.status(500).json({ error: "Failed to issue refund. Please try again." });
            }
        });
    });
});

// GET receipt details for a specific booking
app.get('/api/bookings/receipt/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const query = `
        SELECT b.*, 
               f.name as facility_name, f.location, f.host_id,
               u.name as player_name, u.email as player_email,
               h.name as host_name, h.email as host_email, h.company_name as host_company_name
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN users u ON b.user_id = u.id
        LEFT JOIN users h ON f.host_id = h.id
        WHERE b.id = ? 
    `;

    db.get(query, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Booking not found" });

        // Ensure the requester is either the player, the host, or an admin
        let isCoHost = false;
        try { if (row.co_host_emails && JSON.parse(row.co_host_emails).includes(req.session.email)) isCoHost = true; } catch(e){}
        
        let hasBaseAccess = (row.user_id === req.session.userId || row.host_id === req.session.userId || isCoHost || req.session.userRole === 'admin');
        
        if (!hasBaseAccess && row.booking_type === 'public_session') {
            // Check if they are a participant
            db.get("SELECT psp.quantity, psp.quantity_adult, psp.quantity_kid, u2.name as player_name, u2.email as player_email FROM public_session_participants psp JOIN users u2 ON psp.user_id = u2.id WHERE psp.booking_id = ? AND psp.user_id = ? AND psp.payment_status = 'paid'", [id, req.session.userId], (err, pspRow) => {
                if (err || !pspRow) return res.status(403).json({ error: "Forbidden: You don't have access to this receipt" });
                // Override receipt data just for them
                const costAdults = (pspRow.quantity_adult || 0) * (row.participant_price || 0);
                const costKids = (pspRow.quantity_kid || 0) * (row.participant_kid_price || 0);
                row.total_price = costAdults + costKids;
                row.player_name = pspRow.player_name;
                row.player_email = pspRow.player_email;
                row.quantity_adult = pspRow.quantity_adult || 0;
                row.quantity_kid = pspRow.quantity_kid || 0;
                row.cost_adults = costAdults;
                row.cost_kids = costKids;
                res.json(row);
            });
        } else if (hasBaseAccess) {
            res.json(row);
        } else {
            return res.status(403).json({ error: "Forbidden: You don't have access to this receipt" });
        }
    });
});

// POST cancel booking (Customer)
app.post('/api/bookings/:id/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const bookingId = req.params.id;
    const { reason } = req.body;

    db.get("SELECT * FROM bookings WHERE id = ? AND user_id = ?", [bookingId, req.session.userId], async (err, booking) => {
        if (err || !booking) return res.status(404).json({ error: "Booking not found" });

        // Check if >= 48 hours
        try {
            let earliestSlot = "23:59";
            const slots = JSON.parse(booking.time_slots);
            if (slots && slots.length > 0) earliestSlot = [...slots].sort()[0];
            
            const [hours, mins] = earliestSlot.split(':');
            const bookingDateTimeStr = `${booking.booking_date}T${hours.padStart(2, '0')}:${mins.padStart(2, '0')}:00`;
            const bookingDate = new Date(bookingDateTimeStr);
            
            const serverNow = new Date();
            const tzStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' }); 
            const now = new Date(tzStr);

            const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);

            if (hoursDiff < 48) {
                return res.status(400).json({ error: "Cancellations are only allowed at least 48 hours prior to the event." });
            }

            // Process Refund
            if (booking.stripe_session_id) {
                const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
                if (session && session.payment_intent) {
                    await stripe.refunds.create(
                        { payment_intent: session.payment_intent },
                        { idempotencyKey: `refund-booking-${bookingId}` }
                    );
                }
            }

            // Send cancellation emails
            try {
                const emailDetails = await getBookingDetailsForEmail(bookingId);
                if (emailDetails) emailService.sendCancellationEmail(emailDetails, 'player');
            } catch(e) { console.error("Could not send cancel email", e); }

            // Save cancellation to a log/notes or just soft delete.
            const cancelSql = `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $1, cancellation_reason = 'Cancelled by player' WHERE id = $2`;
            db.run(cancelSql, [req.session.userId, bookingId], function(err) {
                if (err) return res.status(500).json({ error: "Failed to cancel booking" });
                res.json({ message: "Booking canceled and refunded successfully." });
            });

        } catch (e) {
            console.error("Cancellation Error:", e);
            res.status(500).json({ error: "Error processing cancellation" });
        }
    });
});

// PUT archive a past booking
app.put('/api/host/bookings/:id/archive', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const bookingId = req.params.id;

    const query = `
        SELECT b.id 
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)
    `;

    db.get(query, [bookingId, req.session.userId, `%"${req.session.email}"%`], (err, booking) => {
        if (err || !booking) return res.status(403).json({ error: "Access denied or booking not found" });

        db.run("UPDATE bookings SET is_archived = 1 WHERE id = ?", [bookingId], function(err) {
            if (err) return res.status(500).json({ error: "Failed to archive booking" });
            res.json({ message: "Booking archived successfully." });
        });
    });
});

// POST cancel booking (Host)
app.post('/api/host/bookings/:id/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const bookingId = req.params.id;
    const { cancel_scope } = req.body;

    const query = `
        SELECT b.*, f.host_id, f.co_host_emails 
        FROM bookings b
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)
    `;

    db.get(query, [bookingId, req.session.userId, `%"${req.session.email}"%`], async (err, booking) => {
        if (err || !booking) return res.status(403).json({ error: "Access denied or booking not found" });

        try {
            // Check if booking is in the past
            let isPast = false;
            try {
                let earliestSlot = "23:59";
                const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                if (slots && slots.length > 0) earliestSlot = [...slots].sort()[0];
                const [sh, sm] = earliestSlot.split(':');
                const bDateStr = `${booking.booking_date}T${(sh || '23').padStart(2, '0')}:${(sm || '59').padStart(2, '0')}:00`;
                const bDate = new Date(bDateStr);
                const serverNow = new Date();
                const tzStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' });
                if (bDate < new Date(tzStr)) isPast = true;
            } catch (e) {
                const today = new Date();
                today.setHours(0,0,0,0);
                if (new Date(booking.booking_date) < today) isPast = true;
            }

            if (isPast) {
                return res.status(400).json({ error: "Cannot cancel a booking that has already past." });
            }

            // Process Refund
            if (booking.stripe_session_id) {
                const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
                if (session && session.payment_intent) {
                    // Full refund
                    await stripe.refunds.create(
                        { payment_intent: session.payment_intent },
                        { idempotencyKey: `refund-booking-${bookingId}` }
                    );
                }
            }

            // Send cancellation emails
            try {
                const emailDetails = await getBookingDetailsForEmail(bookingId);
                if (emailDetails) emailService.sendCancellationEmail(emailDetails, 'host');
            } catch(e) { console.error("Could not send cancel email", e); }

            // Soft delete booking to free slots
            const baseUpdate = `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by_user_id = $1, cancellation_reason = 'Cancelled by host'`;
            
            if (cancel_scope === 'all' && booking.recurring_group_id) {
                db.run(`${baseUpdate} WHERE recurring_group_id = $2`, [req.session.userId, booking.recurring_group_id], function(err) {
                    if (err) return res.status(500).json({ error: "Failed to cancel bookings" });
                    res.json({ message: "All recurring bookings canceled successfully." });
                });
            } else if (cancel_scope === 'following' && booking.recurring_group_id) {
                db.run(`${baseUpdate} WHERE recurring_group_id = $2 AND booking_date >= $3`, [req.session.userId, booking.recurring_group_id, booking.booking_date], function(err) {
                    if (err) return res.status(500).json({ error: "Failed to cancel bookings" });
                    res.json({ message: "This and following bookings canceled successfully." });
                });
            } else {
                db.run(`${baseUpdate} WHERE id = $2`, [req.session.userId, bookingId], function(err) {
                    if (err) return res.status(500).json({ error: "Failed to cancel booking" });
                    res.json({ message: "Booking canceled and refunded successfully." });
                });
            }

        } catch (e) {
            console.error("Host Cancellation Error:", e);
            res.status(500).json({ error: "Error processing cancellation" });
        }
    });
});

// --- DISCOUNTS Endpoints ---

// GET discounts for a host's facility
app.get('/api/host/discounts/:facility_id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const facilityId = req.params.facility_id;
    
    // Verify host owns this facility
    db.get("SELECT id FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facilityId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
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

    const { facility_id, discount_type, value, start_date, end_date, start_time, end_time, recurring_day, is_last_minute } = req.body;
    
    if (!facility_id || !discount_type || !value) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    db.get("SELECT id FROM facilities WHERE id = ? AND (host_id = ? OR co_host_emails LIKE ?)", [facility_id, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied" });

        db.run(
            `INSERT INTO discounts (facility_id, discount_type, value, start_date, end_date, start_time, end_time, recurring_day, is_last_minute, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [facility_id, discount_type, value, start_date, end_date, start_time, end_time, recurring_day, is_last_minute],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ message: "Discount created", id: this.lastID });
            }
        );
    });
});

// UPDATE an existing discount
app.put('/api/host/discounts/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const discountId = req.params.id;
    const { discount_type, value, start_date, end_date, start_time, end_time, recurring_day, is_last_minute } = req.body;

    if (!discount_type || !value) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify ownership via JOIN
    const stmt = `
        SELECT d.id FROM discounts d 
        JOIN facilities f ON d.facility_id = f.id 
        WHERE d.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)
    `;

    db.get(stmt, [discountId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        if (err || !row) return res.status(403).json({ error: "Access denied or discount not found" });

        db.run(
            `UPDATE discounts 
             SET discount_type = ?, value = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?, recurring_day = ?, is_last_minute = ? 
             WHERE id = ?`,
            [discount_type, value, start_date, end_date, start_time, end_time, recurring_day, is_last_minute, discountId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Discount updated successfully" });
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
            WHERE d.id = ? AND (f.host_id = ? OR f.co_host_emails LIKE ?)`, 
            [discountId, req.session.userId, `%"${req.session.email}"%`], (err, row) => {
        
        if (err || !row) return res.status(403).json({ error: "Access denied" });

        db.run("DELETE FROM discounts WHERE id = ?", [discountId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(200).json({ message: "Discount deleted" });
        });
    });
});


// Accept Terms and Conditions
app.post('/api/host/accept-terms', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    
    db.run("UPDATE users SET terms_accepted = 1, terms_accepted_at = ? WHERE id = ?", [new Date().toISOString(), req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ success: true, message: "Terms accepted" });
    });
});

// --- STRIPE CONNECT Endpoints ---

// Create Stripe Account and Onboarding Link
app.post('/api/stripe/onboard', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    try {
        db.get("SELECT * FROM users WHERE id = ?", [req.session.userId], async (err, user) => {
            if (err || !user) return res.status(500).json({ error: "User not found" });

            let accountId = user.stripe_account_id;

            if (!accountId) {
                const account = await stripe.accounts.create({
                    type: 'express',
                    email: user.email,
                    capabilities: {
                        card_payments: { requested: true },
                        transfers: { requested: true },
                    },
                });
                accountId = account.id;
                db.run("UPDATE users SET stripe_account_id = ? WHERE id = ?", [accountId, user.id]);
            }

            const origin = `${req.protocol}://${req.get('host')}`;
            const accountLink = await stripe.accountLinks.create({
                account: accountId,
                refresh_url: `${origin}/api/stripe/refresh`,
                return_url: `${origin}/api/stripe/return?account_id=${accountId}`,
                type: 'account_onboarding',
            });

            res.json({ url: accountLink.url });
        });
    } catch (error) {
        console.error("Stripe Onboard Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/stripe/return', async (req, res) => {
    if (!req.session.userId) return res.redirect('/index.html');
    const { account_id } = req.query;

    try {
        const account = await stripe.accounts.retrieve(account_id);
        if (account.details_submitted) {
            db.run("UPDATE users SET stripe_onboarding_complete = 1 WHERE stripe_account_id = ?", [account_id]);
            res.redirect('/owner-dashboard.html?tab=wallet&stripe=success');
        } else {
            res.redirect('/owner-dashboard.html?tab=wallet&stripe=incomplete');
        }
    } catch (error) {
        console.error("Stripe Return Error:", error);
        res.redirect('/owner-dashboard.html?tab=wallet&stripe=error');
    }
});

app.get('/api/stripe/refresh', (req, res) => {
    res.redirect('/owner-dashboard.html?tab=wallet&stripe=refresh');
});

app.post('/api/stripe/dashboard', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    db.get("SELECT stripe_account_id FROM users WHERE id = ?", [req.session.userId], async (err, user) => {
        if (err || !user || !user.stripe_account_id) return res.status(400).json({ error: "No Stripe account linked" });
        try {
            const loginLink = await stripe.accounts.createLoginLink(user.stripe_account_id);
            res.json({ url: loginLink.url });
        } catch (error) {
            console.error("Stripe Login Link Error:", error);
            res.status(500).json({ error: error.message });
        }
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
    const query = `
        SELECT f.*, u.email as host_email, u.first_name as host_first_name, u.last_name as host_last_name, u.phone_number as host_phone_number, u.name as host_name
        FROM facilities f
        LEFT JOIN users u ON f.host_id = u.id
        ORDER BY f.id DESC
    `;
    db.all(query, [], (err, rows) => {
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
    db.all("SELECT id, name, first_name, last_name, phone_number, email, role, status, terms_accepted, terms_accepted_at FROM users ORDER BY id DESC", [], (err, rows) => {
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

// GET all bookings (Admin view)
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
    const query = `
        SELECT b.*, 
               f.name as facility_name, f.host_id,
               u_player.name as player_name, u_player.email as player_email, u_player.phone_number as player_phone_number,
               u_host.name as host_name
        FROM bookings b
        LEFT JOIN facilities f ON b.facility_id = f.id
        LEFT JOIN users u_player ON b.user_id = u_player.id
        LEFT JOIN users u_host ON f.host_id = u_host.id
        ORDER BY b.booking_date DESC, b.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- BOOKINGS Endpoints ---

// Helper for price calculation
function calculatePrice(facility, timeSlots, discounts, bookingDateStr) {
    const bookingDate = new Date(bookingDateStr);
    const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'long' }); 
    const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
    const now = new Date();
    const isLastMinute = bookingDate.getTime() - now.getTime() < 86400000 && bookingDate.getTime() >= now.getTime() - 86400000; 

    let rules = [];
    if (facility.pricing_rules) {
        try { rules = JSON.parse(facility.pricing_rules); } catch(e) {}
    }

    function getHourlyRate(time24, rules, basePrice, isWeekend) {
        if (!rules || rules.length === 0) return basePrice;
        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            
            if (rule.days === 'weekdays' && isWeekend) continue;
            if (rule.days === 'weekends' && !isWeekend) continue;
            
            if (time24 >= rule.start && time24 < rule.end) {
                return parseFloat(rule.price);
            }
        }
        return basePrice;
    }

    let basePriceTotal = 0;
    timeSlots.forEach(slotId => {
        const rate = getHourlyRate(slotId, rules, facility.base_price, isWeekend);
        basePriceTotal += rate / 2; // Each slot is 30 mins (half an hour)
    });

    const validDiscounts = discounts.filter(d => {
        if (!d.is_active) return false;
        if (d.start_date && new Date(d.start_date) > bookingDate) return false;
        if (d.end_date && new Date(d.end_date) < bookingDate) return false;
        
        if (d.recurring_day !== null && d.recurring_day !== undefined && d.recurring_day !== '') {
            const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            if (daysMap[parseInt(d.recurring_day, 10)] !== dayOfWeek) return false;
        }

        return true;
    });

    let bestDiscountValue = 0;
    validDiscounts.forEach(d => {
        let applicableSubtotal = 0;
        let applicableCount = 0;
        
        timeSlots.forEach(slotId => {
            let applies = true;
            
            if (d.is_last_minute) {
                const [slotH, slotM] = slotId.split(':');
                const exactSlotTime = new Date(bookingDateStr + 'T00:00:00');
                exactSlotTime.setHours(parseInt(slotH, 10), parseInt(slotM, 10));
                
                const msDiff = exactSlotTime.getTime() - now.getTime();
                if (msDiff > 86400000 || msDiff < 0) {
                    applies = false; // Not within 24 hours or already passed
                }
            }

            if (applies && d.start_time && d.end_time) {
                if (slotId < d.start_time || slotId >= d.end_time) applies = false;
            }
            if (applies) {
                applicableCount++;
                const rate = getHourlyRate(slotId, rules, facility.base_price);
                applicableSubtotal += rate / 2;
            }
        });

        if (applicableCount === 0) return;

        let discountVal = 0;
        if (d.discount_type === 'percentage') {
            discountVal = applicableSubtotal * (d.value / 100);
        } else if (d.discount_type === 'fixed_amount') {
            discountVal = d.value;
        }
        if (discountVal > bestDiscountValue) bestDiscountValue = discountVal;
    });

    const finalPrice = Math.max(0, basePriceTotal - bestDiscountValue);
    return {
        base_price: basePriceTotal,
        discount_amount: bestDiscountValue,
        total_price: finalPrice
    };
}

// Calculate price before booking
app.post('/api/bookings/calculate', (req, res) => {
    const { facility_id, booking_date, time_slots, multi_day_slots } = req.body;
    if (!facility_id || (!booking_date && !multi_day_slots)) return res.status(400).json({ error: "Missing fields" });

    db.get("SELECT base_price, pricing_rules FROM facilities WHERE id = ?", [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, discounts) => {
            if (err) return res.status(500).json({ error: "DB Error" });
            
            let totalPricing = { base_price: 0, discount_amount: 0, total_price: 0 };
            
            try {
                if (multi_day_slots) {
                    let parsedMulti = typeof multi_day_slots === 'string' ? JSON.parse(multi_day_slots) : multi_day_slots;
                    for (const [dateStr, slots] of Object.entries(parsedMulti)) {
                        const pricing = calculatePrice(facility, slots, discounts, dateStr);
                        totalPricing.base_price += pricing.base_price;
                        totalPricing.discount_amount += pricing.discount_amount;
                        totalPricing.total_price += pricing.total_price;
                    }
                } else {
                    let slots = typeof time_slots === 'string' ? JSON.parse(time_slots) : time_slots;
                    totalPricing = calculatePrice(facility, slots, discounts, booking_date);
                }
                res.json(totalPricing);
            } catch (e) {
                res.status(400).json({ error: "Invalid format" });
            }
        });
    });
});

app.post('/api/create-checkout-session', (req, res) => {
    const { facility_id, booking_date, time_slots, multi_day_slots } = req.body;
    
    // In a real app we would get the user_id from an auth token or session
    const user_id = req.session.userId; 
    
    if (!user_id) {
        return res.status(401).json({ error: "Unauthorized. Please log in to book." });
    }

    if (req.session.userRole === 'host') {
        return res.status(403).json({ error: "Hosts are not permitted to book facilities." });
    }

    // Validate inputs
    if (!facility_id || (!booking_date && !multi_day_slots)) {
        return res.status(400).json({ error: "Missing required booking information." });
    }

    let parsedMultiDaySlots = null;
    let singleDaySlots = null;

    if (multi_day_slots) {
        try {
            parsedMultiDaySlots = typeof multi_day_slots === 'string' ? JSON.parse(multi_day_slots) : multi_day_slots;
        } catch(e) {
            return res.status(400).json({ error: "Invalid multi_day_slots format." });
        }
    } else {
        try {
            singleDaySlots = typeof time_slots === 'string' ? JSON.parse(time_slots) : time_slots;
            if (!Array.isArray(singleDaySlots)) throw new Error("time_slots must be an array");
            parsedMultiDaySlots = { [booking_date]: singleDaySlots };
        } catch (e) {
            return res.status(400).json({ error: "Invalid time_slots format." });
        }
    }

    // Secure Pricing Calculation
    db.get(`
        SELECT f.name, f.location, f.base_price, f.pricing_rules, f.has_processing_fee, f.processing_fee_amount, u.stripe_account_id, u.stripe_onboarding_complete 
        FROM facilities f 
        JOIN users u ON f.host_id = u.id 
        WHERE f.id = ?
    `, [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, discounts) => {
            if (err) return res.status(500).json({ error: "DB Error" });
            
            let secureTotalPrice = 0;
            for (const [dateStr, slots] of Object.entries(parsedMultiDaySlots)) {
                const p = calculatePrice(facility, slots, discounts, dateStr);
                secureTotalPrice += p.total_price;
            }
            
            // Add processing fee and tax to match frontend
            const taxRate = 0.14975;
            const processingFee = (facility.has_processing_fee === 1 || facility.has_processing_fee === true) ? Number(facility.processing_fee_amount || 0) : 0;
            const finalAmount = secureTotalPrice + processingFee + (secureTotalPrice * taxRate);
            const finalAmountCents = Math.round(finalAmount * 100);

            // 1. Check for existing overlapping bookings across all dates
            const datesArr = Object.keys(parsedMultiDaySlots);
            const placeholders = datesArr.map(() => '?').join(',');
            
            db.all(
                `SELECT booking_date, time_slots FROM bookings WHERE facility_id = ? AND booking_date IN (${placeholders}) AND status != 'cancelled'`,
                [facility_id, ...datesArr],
                async (err, existingBookings) => {
                    if (err) return res.status(500).json({ error: "Database error during availability check." });

                    let hasConflict = false;
                    existingBookings.forEach(booking => {
                        try {
                            const slots = typeof booking.time_slots === 'string' 
                                ? JSON.parse(booking.time_slots) 
                                : booking.time_slots;
                            const newSlotsForDate = parsedMultiDaySlots[booking.booking_date] || [];
                            if (Array.isArray(slots)) {
                                if (newSlotsForDate.some(newSlot => slots.includes(newSlot))) {
                                    hasConflict = true;
                                }
                            }
                        } catch (e) {}
                    });

                    if (hasConflict) {
                        return res.status(409).json({ 
                            error: "Conflict: One or more selected time slots have already been booked." 
                        });
                    }

                    // 4. Proceed with Stripe Session
                    const checkoutToken = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7));
                    
                    const payloadToStore = JSON.stringify({
                        user_id,
                        facility_id,
                        multi_day_slots: parsedMultiDaySlots
                    });

                    db.run("INSERT INTO pending_checkouts (id, payload) VALUES (?, ?)", [checkoutToken, payloadToStore], async function(err) {
                        if (err) return res.status(500).json({ error: "Failed to initialize checkout." });

                        try {
                            const totalDates = Object.keys(parsedMultiDaySlots).length;
                            const descriptionStr = totalDates > 1 
                                ? `Multiple days (${totalDates} dates)` 
                                : `Date: ${Object.keys(parsedMultiDaySlots)[0]}`;

                            const sessionUrl = `${req.protocol}://${req.get('host')}`;
                            
                            const lineItems = [
                                {
                                    price_data: {
                                        currency: 'cad',
                                        product_data: {
                                            name: `${facility.name} Booking`,
                                            description: descriptionStr,
                                        },
                                        unit_amount: Math.round(secureTotalPrice * 100),
                                    },
                                    quantity: 1,
                                }
                            ];

                        if (processingFee > 0) {
                            lineItems.push({
                                price_data: {
                                    currency: 'cad',
                                    product_data: {
                                        name: 'Platform Processing Fee',
                                    },
                                    unit_amount: Math.round(processingFee * 100),
                                },
                                quantity: 1,
                            });
                        }

                        const taxAmount = secureTotalPrice * taxRate;
                        if (taxAmount > 0) {
                            lineItems.push({
                                price_data: {
                                    currency: 'cad',
                                    product_data: {
                                        name: 'Taxes',
                                        description: `Based on listing location: ${facility.location} (QST + GST 14.975%)`,
                                    },
                                    unit_amount: Math.round(taxAmount * 100),
                                },
                                quantity: 1,
                            });
                        }

                        const finalAmountCentsCalculated = lineItems.reduce((acc, item) => acc + item.price_data.unit_amount, 0);

                        const sessionConfig = {
                            payment_method_types: ['card'],
                            line_items: lineItems,
                            mode: 'payment',
                            success_url: `${sessionUrl}/player-dashboard.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
                            cancel_url: `${sessionUrl}/facility.html?id=${facility_id}&canceled=true`,
                            metadata: {
                                checkout_token: checkoutToken
                            }
                        };

                        // Split Payment if Host is onboarded via Stripe Connect
                        if (facility.stripe_account_id && facility.stripe_onboarding_complete) {
                            const platformFeeCents = Math.round(finalAmountCentsCalculated * 0.05); // 5% platform fee
                            sessionConfig.payment_intent_data = {
                                application_fee_amount: platformFeeCents,
                                transfer_data: {
                                    destination: facility.stripe_account_id,
                                },
                            };
                        }

                        const session = await stripe.checkout.sessions.create(sessionConfig);
                        
                        res.status(200).json({ url: session.url });
                    } catch (stripeErr) {
                        console.error("Stripe Checkout Error:", stripeErr);
                        res.status(500).json({ error: "Could not create payment session" });
                    }
                    }); // END pending_checkouts insert callback
                }
            );
        });
    });
});

// Sync Fallback for Localhost where Webhooks cannot reach
app.post('/api/bookings/confirm', async (req, res) => {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        
        if (session.payment_status === 'paid') {
            const metadata = session.metadata;
            // Check if it already exists (in case webhook actually fired in prod)
            db.get("SELECT id FROM bookings WHERE stripe_session_id = ?", [session.id], async (err, existing) => {
                if (err) return res.status(500).json({ error: "DB Error" });
                if (existing) {
                    return res.json({ success: true, message: "Booking already confirmed." });
                }

                if (metadata && metadata.checkout_token) {
                    try {
                        const row = await new Promise((resolve, reject) => {
                            db.get("SELECT payload FROM pending_checkouts WHERE id = ?", [metadata.checkout_token], (err, r) => {
                                if (err) reject(err); else resolve(r);
                            });
                        });
                        if (!row) return res.status(500).json({ error: "Missing payload" });
                        
                        const payload = JSON.parse(row.payload);
                        const { user_id, facility_id, multi_day_slots } = payload;
                        const price = session.amount_total / 100;
                        const recurringGroupId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);

                        await db.transaction(async (client) => {
                            await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [facility_id]);
                            const datesArr = Object.keys(multi_day_slots);
                            const { rows: existingBookings } = await client.query(
                                `SELECT booking_date, time_slots FROM bookings WHERE facility_id = $1 AND booking_date = ANY($2::text[]) AND status != 'cancelled' FOR UPDATE`,
                                [facility_id, datesArr]
                            );

                            let hasConflict = false;
                            existingBookings.forEach(booking => {
                                try {
                                    const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                                    const newSlotsForDate = multi_day_slots[booking.booking_date] || [];
                                    if (Array.isArray(slots) && newSlotsForDate.some(newSlot => slots.includes(newSlot))) {
                                        hasConflict = true;
                                    }
                                } catch (e) {}
                            });

                            if (hasConflict) {
                                const err = new Error("Conflict: Time slots already booked.");
                                err.status = 409;
                                throw err;
                            }

                            for (const [date, slots] of Object.entries(multi_day_slots)) {
                                const slotsStr = JSON.stringify(slots);
                                const result = await client.query(
                                    "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, payment_status, stripe_session_id, recurring_group_id) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'online', 'paid', $6, $7) RETURNING id",
                                    [user_id, facility_id, date, slotsStr, price, session.id, recurringGroupId]
                                );
                                sendBookingEmails(result.rows[0].id);
                            }
                        });
                        res.json({ success: true, message: "Bookings confirmed" });
                    } catch(e) {
                        if (e.status === 409) return res.status(409).json({ error: "Conflict: Double booking detected." });
                        res.status(500).json({ error: "Payload or processing error" });
                    }
                } else if (metadata && metadata.type === 'public_session_join') {
                    const bookingId = metadata.booking_id;
                    const userId = metadata.user_id;

                    await new Promise((resolve, reject) => {
                        db.run(
                            "UPDATE public_session_participants SET payment_status = 'paid' WHERE booking_id = ? AND user_id = ? AND stripe_session_id = ?",
                            [bookingId, userId, session.id],
                            function(err) {
                                if (err) {
                                    res.status(500).json({ error: "Failed to confirm public session" });
                                    reject(err);
                                } else {
                                    sendPublicSessionJoinEmails(bookingId, userId);
                                    res.json({ success: true, message: "Public session confirmed" });
                                    resolve();
                                }
                            }
                        );
                    });
                } else if (metadata && metadata.facility_id) {
                    // Backward compatibility
                    try {
                        const facilityId = metadata.facility_id;
                        const bookingDate = metadata.booking_date;
                        const timeSlotsStr = metadata.time_slots;
                        const userId = metadata.user_id;
                        const price = session.amount_total / 100;

                        await db.transaction(async (client) => {
                            await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text || '|' || $2::text)::bigint)", [facilityId, bookingDate]);
                            const { rows: existingBookings } = await client.query(
                                `SELECT time_slots FROM bookings WHERE facility_id = $1 AND booking_date = $2 AND status != 'cancelled' FOR UPDATE`,
                                [facilityId, bookingDate]
                            );

                            let hasConflict = false;
                            const newSlots = typeof timeSlotsStr === 'string' ? JSON.parse(timeSlotsStr) : timeSlotsStr;
                            existingBookings.forEach(booking => {
                                try {
                                    const slots = typeof booking.time_slots === 'string' ? JSON.parse(booking.time_slots) : booking.time_slots;
                                    if (Array.isArray(slots) && newSlots.some(ns => slots.includes(ns))) {
                                        hasConflict = true;
                                    }
                                } catch (e) {}
                            });

                            if (hasConflict) {
                                const err = new Error("Conflict: Time slots already booked.");
                                err.status = 409;
                                throw err;
                            }

                            const result = await client.query(
                                "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, payment_status, stripe_session_id) VALUES ($1, $2, $3, $4, $5, 'confirmed', 'online', 'paid', $6) RETURNING id",
                                [userId, facilityId, bookingDate, typeof timeSlotsStr === 'string' ? timeSlotsStr : JSON.stringify(timeSlotsStr), price, session.id]
                            );
                            sendBookingEmails(result.rows[0].id);
                            res.json({ success: true, booking_id: result.rows[0].id });
                        });
                    } catch(e) {
                        if (e.status === 409) return res.status(409).json({ error: "Conflict: Double booking detected." });
                        res.status(500).json({ error: "Internal server error" });
                    }
                }
            });
        } else {
            res.status(400).json({ error: "Payment not completed" });
        }
    } catch (err) {
        console.error("Sync Confirm Error:", err);
        res.status(500).json({ error: "Failed to confirm session" });
    }
});

// --- REVIEWS Endpoints ---

// POST a review
app.post('/api/reviews', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const { booking_id, rating, comment } = req.body;
    if (!booking_id || rating === undefined) {
        return res.status(400).json({ error: "Booking ID and rating are required" });
    }

    // Verify booking belongs to user and is confirmed
    db.get("SELECT facility_id, booking_date, time_slots FROM bookings WHERE id = ? AND user_id = ? AND status = 'confirmed'", [booking_id, req.session.userId], (err, booking) => {
        if (err || !booking) return res.status(403).json({ error: "Booking not found or access denied" });

        // Ensure the booking time is actually past
        try {
            const slots = JSON.parse(booking.time_slots);
            if (!slots || slots.length === 0) return res.status(400).json({ error: "Invalid booking time slots" });
            
            const sorted = [...slots].sort();
            const latestSlot = sorted[sorted.length - 1];
            let [hours, mins] = latestSlot.split(':').map(Number);
            mins += 30;
            if (mins >= 60) { hours += 1; mins -= 60; }
            
            const serverNow = new Date();
            const tzStr = serverNow.toLocaleString('en-US', { timeZone: 'America/New_York' }); 
            const now = new Date(tzStr);

            const endDateStr = `${booking.booking_date}T${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
            const endDate = new Date(endDateStr);
            
            if (!isNaN(endDate.getTime()) && now < endDate) {
                return res.status(400).json({ error: "Cannot review a booking that hasn't ended yet." });
            }
        } catch(e) {}

        db.get("SELECT id FROM reviews WHERE booking_id = ?", [booking_id], (err, existingReview) => {
            if (existingReview) return res.status(400).json({ error: "Review already submitted for this booking" });

            const facilityId = booking.facility_id;
            
            // Insert review
            db.run(
                "INSERT INTO reviews (facility_id, user_id, booking_id, rating, comment) VALUES (?, ?, ?, ?, ?)",
                [facilityId, req.session.userId, booking_id, rating, comment || ''],
                function(insertErr) {
                    if (insertErr) return res.status(500).json({ error: "Failed to submit review" });

                    // Update facility rating
                    db.get("SELECT AVG(rating) as avg_rating, COUNT(id) as total_reviews FROM reviews WHERE facility_id = ?", [facilityId], (statsErr, stats) => {
                        if (!statsErr && stats) {
                            const newRating = stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(1) : 0;
                            db.run("UPDATE facilities SET rating = ?, reviews_count = ? WHERE id = ?", [newRating, stats.total_reviews || 0, facilityId]);
                        }
                    });

                    res.status(201).json({ message: "Review submitted successfully" });
                }
            );
        });
    });
});

// GET reviews for a facility
app.get('/api/facilities/:id/reviews', (req, res) => {
    const facilityId = req.params.id;
    db.all(`
        SELECT r.id, r.rating, r.comment, r.created_at, u.name, u.first_name, u.last_name, u.profile_picture 
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.facility_id = ?
        ORDER BY r.created_at DESC
    `, [facilityId], (err, reviews) => {
        if (err) return res.status(500).json({ error: "Failed to fetch reviews" });
        res.json(reviews);
    });
});

// --- SAVED FACILITIES Endpoints ---

// GET user's saved facilities
app.get('/api/saved-facilities/my', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const query = `
        SELECT f.*, sf.created_at as saved_at
        FROM saved_facilities sf
        JOIN facilities f ON sf.facility_id = f.id
        WHERE sf.user_id = ?
        ORDER BY sf.created_at DESC
    `;
    db.all(query, [req.session.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET to check if a specific facility is saved
app.get('/api/saved-facilities/check/:facilityId', (req, res) => {
    if (!req.session.userId) return res.json({ saved: false });
    
    db.get(
        "SELECT id FROM saved_facilities WHERE user_id = ? AND facility_id = ?",
        [req.session.userId, req.params.facilityId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ saved: !!row });
        }
    );
});

// POST to save a facility
app.post('/api/saved-facilities', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    const { facility_id } = req.body;
    if (!facility_id) return res.status(400).json({ error: "Facility ID is required" });

    db.run(
        "INSERT INTO saved_facilities (user_id, facility_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        [req.session.userId, facility_id],
        function(err) {
            // SQLite uses INSERT OR IGNORE, PostgreSQL uses ON CONFLICT DO NOTHING
            // The adaptQuery in database.js might not handle Postgres specific syntax flawlessly if it's pure sqlite,
            // wait, database.js has standard PostgreSQL creation queries but we use standard db.run wrappers.
            // Let's assure we handle errors if it exists.
            if (err) {
                if (err.code === '23505' || err.message.includes('UNIQUE constraint')) {
                    return res.status(200).json({ message: "Already saved" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: "Facility saved successfully" });
        }
    );
});

// DELETE a saved facility
app.delete('/api/saved-facilities/:facilityId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    db.run(
        "DELETE FROM saved_facilities WHERE user_id = ? AND facility_id = ?",
        [req.session.userId, req.params.facilityId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Facility unsaved successfully" });
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
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
