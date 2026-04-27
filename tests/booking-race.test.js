const request = require('supertest');
const app = require('../server');
const db = require('../database');

if (!process.env.TEST_DATABASE_URL) {
    console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run tests without an explicit test database.");
    process.exit(1);
}

describe('Booking Race Condition', () => {
    let agent;
    let facilityId;

    beforeAll(async () => {
        agent = request.agent(app);
        
        // Wait for DB to be ready (just in case initDatabase is still running)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Create a test host user directly via DB
        const testEmail = `host_${Date.now()}@test.com`;
        const testPassword = "Password123";
        const hashedPassword = require('bcryptjs').hashSync(testPassword, 10);
        
        let hostId;
        await new Promise((resolve, reject) => {
            db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'host')", 
                ["Test Host", testEmail, hashedPassword], function(err) {
                    if (err) reject(err);
                    else {
                        hostId = this.lastID;
                        resolve();
                    }
                });
        });

        // 2. Login to get session cookie
        await agent.post('/api/auth/login').send({
            email: testEmail,
            password: testPassword
        }).expect(200);

        // 3. Create a test facility assigned to this host
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
    });

    it('should handle 10 concurrent booking attempts correctly (1 succeeds, 9 fail with 409)', async () => {
        const payload = {
            facility_id: facilityId,
            booking_date: "2030-01-01",
            time_slots: ["10:00", "10:30"],
            manual_notes: "Race test",
            booking_type: "manual",
            repeat_option: "none"
        };

        // Fire 10 requests concurrently
        const requests = [];
        for (let i = 0; i < 10; i++) {
            requests.push(agent.post('/api/host/block-time').send(payload));
        }

        const responses = await Promise.all(requests);
        
        const successResponses = responses.filter(r => r.status === 201);
        const conflictResponses = responses.filter(r => r.status === 409);

        // Debug output if it doesn't match
        if (successResponses.length !== 1 || conflictResponses.length !== 9) {
            console.log(responses.map(r => ({ status: r.status, body: r.body })));
        }

        expect(successResponses.length).toBe(1);
        expect(conflictResponses.length).toBe(9);
    }, 30000);
});
