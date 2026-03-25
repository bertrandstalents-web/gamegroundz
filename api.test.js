const request = require('supertest');
const app = require('./server'); // Path to express app
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

describe('GameGroundz API Endpoints', () => {
    let testFacilityId;
    let adminCookie;

    beforeAll(async () => {
        // Register a test user
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test Admin', email: 'testadmin@example.com', password: 'password123' });
        
        // Upgrade to admin in DB manually
        return new Promise((resolve, reject) => {
            const dbPath = path.resolve(__dirname, 'gamegroundz.db');
            const db = new sqlite3.Database(dbPath);
            db.run("UPDATE users SET role = 'admin' WHERE email = 'testadmin@example.com'", function(err) {
                db.close();
                if(err) reject(err);
                else resolve();
            });
        });
    });

    it('should fetch public facilities with list_status = approved', async () => {
        const res = await request(app).get('/api/facilities');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBeTruthy();
        
        if (res.body.length > 0) {
             testFacilityId = res.body[0].id;
             expect(res.body[0].listing_status).toBe('approved');
        }
    });

    it('should fetch single facility and include discounts', async () => {
        if (!testFacilityId) testFacilityId = 1; // Fallback
        
        const res = await request(app).get(`/api/facilities/${testFacilityId}`);
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('discounts');
        expect(Array.isArray(res.body.discounts)).toBe(true);
    });

    it('should login as admin and obtain cookie', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'testadmin@example.com', password: 'password123' });
            
        expect(res.statusCode).toBe(200);
        expect(res.body.user.role).toBe('admin');
        adminCookie = res.headers['set-cookie'];
    });

    it('should retrieve all facilities as admin via /api/admin/facilities', async () => {
        const res = await request(app)
            .get('/api/admin/facilities')
            .set('Cookie', adminCookie);
        
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should deny access to /api/admin/facilities without authentication', async () => {
         const res = await request(app).get('/api/admin/facilities');
         expect(res.statusCode).toBe(401);
    });

    it('should calculate price for a booking (2 time slots)', async () => {
         if (!testFacilityId) testFacilityId = 1;
         
         const res = await request(app)
            .post('/api/bookings/calculate')
            .send({ 
                 facility_id: testFacilityId, 
                 booking_date: '2027-01-01', 
                 time_slots: ['10:00', '10:30'] 
            });
            
         expect(res.statusCode).toBe(200);
         expect(res.body).toHaveProperty('base_price');
         expect(res.body).toHaveProperty('total_price');
         expect(res.body).toHaveProperty('discount_amount');
         // We expect total_price = base_price - discount_amount
         expect(res.body.total_price).toBe(res.body.base_price - res.body.discount_amount);
    });
});
