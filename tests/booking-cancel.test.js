const request = require('supertest');
const app = require('../server');
const db = require('../database');

if (!process.env.TEST_DATABASE_URL) {
    console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run tests without an explicit test database.");
    process.exit(1);
}

describe('Booking Cancellation (Soft Delete)', () => {
    let agent;
    let facilityId;
    let hostId;

    beforeAll(async () => {
        agent = request.agent(app);
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const testEmail = `host_cancel_${Date.now()}@test.com`;
        const testPassword = "Password123";
        const hashedPassword = require('bcryptjs').hashSync(testPassword, 10);
        
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

        await agent.post('/api/auth/login').send({ email: testEmail, password: testPassword }).expect(200);

        await new Promise((resolve, reject) => {
            db.run("INSERT INTO facilities (name, type, environment, base_price, location, image_url, host_id, listing_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')",
                ["Test Cancel Facility", "Other", "indoor", 100, "Test Location", "test.jpg", hostId], function(err) {
                    if (err) reject(err);
                    else {
                        facilityId = this.lastID;
                        resolve();
                    }
                }
            );
        });
    });

    it('should soft delete the booking, keep the row, and allow re-booking', async () => {
        const payload = {
            facility_id: facilityId,
            booking_date: "2030-01-05",
            time_slots: ["14:00", "14:30"],
            manual_notes: "Cancel test",
            booking_type: "manual",
            repeat_option: "none"
        };

        // 1. Book the slot
        await agent.post('/api/host/block-time').send(payload).expect(201);

        // Fetch the booking ID
        const booking = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM bookings WHERE facility_id = ? AND booking_date = ?", [facilityId, "2030-01-05"], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        expect(booking).toBeDefined();
        const bookingId = booking.id;

        // 2. Cancel the booking
        await agent.post(`/api/host/bookings/${bookingId}/cancel`).send({ cancel_scope: 'only_this' }).expect(200);

        // 3. Verify row exists and status is 'cancelled'
        const cancelledBooking = await new Promise((resolve, reject) => {
            db.get("SELECT status, cancelled_at, cancelled_by_user_id, cancellation_reason FROM bookings WHERE id = ?", [bookingId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });
        
        expect(cancelledBooking).toBeDefined();
        expect(cancelledBooking.status).toBe('cancelled');
        expect(cancelledBooking.cancelled_at).toBeDefined();
        expect(cancelledBooking.cancelled_by_user_id).toBe(hostId);
        expect(cancelledBooking.cancellation_reason).toBe('Cancelled by host');

        // 4. Re-book the same slot, should succeed (no conflict)
        await agent.post('/api/host/block-time').send(payload).expect(201);
    }, 30000);
});
