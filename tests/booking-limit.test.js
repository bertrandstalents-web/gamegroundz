const request = require('supertest');
const app = require('../server');
const db = require('../database');

if (!process.env.TEST_DATABASE_URL) {
    console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run tests without an explicit test database.");
    process.exit(1);
}

describe('Booking Max Reservation Limits', () => {
    let hostAgent;
    let playerAgent;
    let facilityId;
    let surfaceId;
    let hostId;
    let playerId;

    beforeAll(async () => {
        hostAgent = request.agent(app);
        playerAgent = request.agent(app);
        
        // Wait for DB to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create verified host user
        const hostEmail = `host_limit_${Date.now()}@test.com`;
        const testPassword = "Password123";
        const hashedPassword = require('bcryptjs').hashSync(testPassword, 10);
        
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, 'host', 1)", 
                ["Test Host", hostEmail, hashedPassword], function(err) {
                    if (err) reject(err);
                    else {
                        hostId = this.lastID;
                        resolve();
                    }
                });
        });

        // Login host
        await hostAgent.post('/api/auth/login').send({ email: hostEmail, password: testPassword }).expect(200);

        // Create verified player user
        const playerEmail = `player_limit_${Date.now()}@test.com`;
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO users (name, email, password, role, is_verified) VALUES (?, ?, ?, 'player', 1)", 
                ["Test Player", playerEmail, hashedPassword], function(err) {
                    if (err) reject(err);
                    else {
                        playerId = this.lastID;
                        resolve();
                    }
                });
        });

        // Login player
        await playerAgent.post('/api/auth/login').send({ email: playerEmail, password: testPassword }).expect(200);

        // Create facility
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO facilities (name, type, environment, base_price, location, image_url, host_id, listing_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')",
                ["Test Limit Facility", "pool", "indoor", 100, "Test Location", "test.jpg", hostId], function(err) {
                    if (err) reject(err);
                    else {
                        facilityId = this.lastID;
                        resolve();
                    }
                }
            );
        });

        // Create surface
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO surfaces (facility_id, host_id, name, type, environment, base_price) VALUES (?, ?, ?, ?, ?, ?)",
                [facilityId, hostId, "Test Limit Surface", "pool", "indoor", 50], function(err) {
                    if (err) reject(err);
                    else {
                        surfaceId = this.lastID;
                        resolve();
                    }
                }
            );
        });
    });

    afterAll(async () => {
        // Clean up connections so Jest exits cleanly
        await db.pool.end();
    });

    it('should enforce maximum booking limit per person for public sessions', async () => {
        // 1. Host creates a public session with a maximum reservation limit of 5 per person
        const sessionPayload = {
            facility_id: facilityId,
            surface_id: surfaceId,
            booking_date: "2030-02-01",
            time_slots: ["12:00", "13:00"],
            manual_notes: "Swimming Lane",
            booking_type: "public_session",
            capacity: 10,
            participant_price: 0.0,
            max_reservations: 5,
            pricing_tiers: JSON.stringify([{ name: 'Adult (18+)', price: 0.0 }])
        };

        await hostAgent.post('/api/host/block-time').send(sessionPayload).expect(201);

        // Fetch the session booking ID
        const session = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM bookings WHERE facility_id = ? AND booking_date = ? AND booking_type = 'public_session'", 
                [facilityId, "2030-02-01"], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
        });
        expect(session).toBeDefined();
        const sessionId = session.id;

        // 2. Player checks status: initially should have 0 booked spots
        const statusRes1 = await playerAgent.get(`/api/public_sessions/single/${sessionId}/my-status`).expect(200);
        expect(statusRes1.body.user_booked_count).toBe(0);

        // 3. Player registers 3 spots (within limit of 5)
        const joinPayload1 = {
            booking_id: sessionId,
            tierQuantities: { "Adult (18+)": 3 }
        };
        await playerAgent.post('/api/public_sessions/join').send(joinPayload1).expect(200);

        // 4. Player checks status again: should have 3 booked spots
        const statusRes2 = await playerAgent.get(`/api/public_sessions/single/${sessionId}/my-status`).expect(200);
        expect(statusRes2.body.user_booked_count).toBe(3);

        // 5. Player tries to register 3 more spots (total 6, exceeding limit of 5) -> should fail
        const joinPayload2 = {
            booking_id: sessionId,
            tierQuantities: { "Adult (18+)": 3 }
        };
        const failRes = await playerAgent.post('/api/public_sessions/join').send(joinPayload2).expect(400);
        expect(failRes.body.error).toContain("Booking limit exceeded");

        // 6. Player registers 2 more spots (total 5, reaching limit of 5) -> should succeed
        const joinPayload3 = {
            booking_id: sessionId,
            tierQuantities: { "Adult (18+)": 2 }
        };
        await playerAgent.post('/api/public_sessions/join').send(joinPayload3).expect(200);

        // 7. Player checks status again: should have 5 booked spots
        const statusRes3 = await playerAgent.get(`/api/public_sessions/single/${sessionId}/my-status`).expect(200);
        expect(statusRes3.body.user_booked_count).toBe(5);

        // 8. Player tries to register 1 more spot (total 6, exceeding limit of 5) -> should fail
        const joinPayload4 = {
            booking_id: sessionId,
            tierQuantities: { "Adult (18+)": 1 }
        };
        const failRes2 = await playerAgent.post('/api/public_sessions/join').send(joinPayload4).expect(400);
        expect(failRes2.body.error).toContain("Booking limit exceeded");
    });

    it('should respect default/no limit configuration', async () => {
        // 1. Host creates a public session with NO limit (max_reservations = null)
        const sessionPayloadNoLimit = {
            facility_id: facilityId,
            surface_id: surfaceId,
            booking_date: "2030-02-02",
            time_slots: ["12:00", "13:00"],
            manual_notes: "Swimming Lane",
            booking_type: "public_session",
            capacity: 10,
            participant_price: 0.0,
            max_reservations: null,
            pricing_tiers: JSON.stringify([{ name: 'Adult (18+)', price: 0.0 }])
        };

        await hostAgent.post('/api/host/block-time').send(sessionPayloadNoLimit).expect(201);

        // Fetch the session booking ID
        const sessionNoLimit = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM bookings WHERE facility_id = ? AND booking_date = ? AND booking_type = 'public_session'", 
                [facilityId, "2030-02-02"], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
        });
        expect(sessionNoLimit).toBeDefined();
        const sessionNoLimitId = sessionNoLimit.id;

        // 2. Player joins the session for the first time -> should succeed
        const joinPayload1 = {
            booking_id: sessionNoLimitId,
            tierQuantities: { "Adult (18+)": 3 }
        };
        await playerAgent.post('/api/public_sessions/join').send(joinPayload1).expect(200);

        // 3. Player tries to join the same session again -> should fail with legacy check message
        const joinPayload2 = {
            booking_id: sessionNoLimitId,
            tierQuantities: { "Adult (18+)": 1 }
        };
        const failRes = await playerAgent.post('/api/public_sessions/join').send(joinPayload2).expect(400);
        expect(failRes.body.error).toBe("You have already joined this session.");
    });
});
