const request = require('supertest');

// Mock stripe
const mockRetrieve = jest.fn().mockResolvedValue({
    payment_intent: 'pi_test_123'
});
const mockRefundsCreate = jest.fn().mockResolvedValue({
    id: 're_test_123'
});
jest.mock('stripe', () => {
    return () => ({
        checkout: {
            sessions: {
                retrieve: mockRetrieve
            }
        },
        refunds: {
            create: mockRefundsCreate
        }
    });
});

// Mock emailService
jest.mock('../utils/emailService', () => ({
    sendCancellationEmail: jest.fn(),
    sendPlayerConfirmation: jest.fn(),
    sendHostConfirmation: jest.fn(),
    sendReviewRequest: jest.fn()
}));

const app = require('../server');
const db = require('../database');

if (!process.env.TEST_DATABASE_URL) {
    console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run tests without an explicit test database.");
    process.exit(1);
}

describe('Player Booking Cancellation (Private and Public Sessions)', () => {
    let agent;
    let playerId;
    let hostId;
    let facilityId;
    let privateBookingId;
    let publicSessionBookingId;
    let pspId;

    beforeAll(async () => {
        agent = request.agent(app);
        
        // Wait for server/db initialization to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        const testPlayerEmail = `player_cancel_${Date.now()}@test.com`;
        const testHostEmail = `host_cancel_${Date.now()}@test.com`;
        const testPassword = "Password123";
        const hashedPassword = require('bcryptjs').hashSync(testPassword, 10);
        
        // 1. Create a Host User
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, 'host', 1)", 
                ["Test Host", testHostEmail, hashedPassword], function(err) {
                    if (err) reject(err);
                    else {
                        hostId = this.lastID;
                        resolve();
                    }
                });
        });

        // 2. Create a Player User
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, 'player', 1)", 
                ["Test Player", testPlayerEmail, hashedPassword], function(err) {
                    if (err) reject(err);
                    else {
                        playerId = this.lastID;
                        resolve();
                    }
                });
        });

        // 3. Create a Facility
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO facilities (name, type, environment, base_price, location, image_url, host_id, listing_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')",
                ["Test Facility", "Other", "indoor", 100, "Test Location", "test.jpg", hostId], function(err) {
                    if (err) reject(err);
                    else {
                        facilityId = this.lastID;
                        resolve();
                    }
                }
            );
        });

        // 4. Create a Private Booking for the Player (Future date, e.g. 2035)
        await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, stripe_session_id) VALUES (?, ?, ?, ?, ?, 'confirmed', 'online', ?)",
                [playerId, facilityId, "2035-06-20", JSON.stringify(["14:00", "14:30"]), 200.0, "stripe_session_private_123"],
                function(err) {
                    if (err) reject(err);
                    else {
                        privateBookingId = this.lastID;
                        resolve();
                    }
                }
            );
        });

        // 5. Create a Public Session Booking (Future date)
        await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO bookings (user_id, facility_id, booking_date, time_slots, total_price, status, booking_type, capacity, participant_price) VALUES (?, ?, ?, ?, ?, 'confirmed', 'public_session', 10, 25.0)",
                [hostId, facilityId, "2035-06-21", JSON.stringify(["15:00", "15:30"]), 0.0],
                function(err) {
                    if (err) reject(err);
                    else {
                        publicSessionBookingId = this.lastID;
                        resolve();
                    }
                }
            );
        });

        // 6. Register Player to Public Session (Paid)
        await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO public_session_participants (booking_id, user_id, payment_status, stripe_session_id, quantity, quantity_adult, quantity_kid) VALUES (?, ?, 'paid', ?, 1, 1, 0)",
                [publicSessionBookingId, playerId, "stripe_session_player_123"],
                function(err) {
                    if (err) reject(err);
                    else {
                        pspId = this.lastID;
                        resolve();
                    }
                }
            );
        });

        // Log in the player
        await agent.post('/api/auth/login').send({ email: testPlayerEmail, password: testPassword }).expect(200);
    });

    it('should successfully cancel a private booking', async () => {
        const response = await agent.post(`/api/bookings/${privateBookingId}/cancel`).send({}).expect(200);
        expect(response.body.message).toContain("canceled and refunded successfully");

        // Verify status in DB
        const booking = await new Promise((resolve, reject) => {
            db.get("SELECT status FROM bookings WHERE id = ?", [privateBookingId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        expect(booking.status).toBe('cancelled');
    });

    it('should successfully cancel/refund a public session participant ticket', async () => {
        const response = await agent.post(`/api/bookings/${publicSessionBookingId}/cancel`).send({}).expect(200);
        expect(response.body.message).toContain("canceled and refunded successfully");

        // Verify participant record in DB is refunded
        const participant = await new Promise((resolve, reject) => {
            db.get("SELECT payment_status FROM public_session_participants WHERE id = ?", [pspId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        expect(participant.payment_status).toBe('refunded');

        // Verify parent booking status is NOT cancelled (since it's a public session and other participants can attend)
        const parentBooking = await new Promise((resolve, reject) => {
            db.get("SELECT status FROM bookings WHERE id = ?", [publicSessionBookingId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        expect(parentBooking.status).not.toBe('cancelled');
    });
});
