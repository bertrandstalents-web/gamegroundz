// one-time migration — run once then leave in place as a record.
const db = require('../database');

async function runMigration() {
    console.log('Running migration...');
    // Wait a brief moment for DB to connect
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // The instructions said "using sqlite3 that runs: UPDATE surfaces..." 
    // We use the database wrapper which provides sqlite3-compatible methods
    db.run(`UPDATE surfaces SET facility_id = 18 WHERE name ILIKE '%arena st canut%' AND facility_id = 17`, [], function(err) {
        if (err) {
            console.error('Error updating:', err);
            process.exit(1);
            return;
        }
        console.log(`Updated rows. Changes: ${this.changes || 0}`);
        
        db.all(`SELECT id, name, facility_id FROM surfaces WHERE name ILIKE '%arena st canut%'`, [], (err, rows) => {
            if (err) {
                console.error('Error verifying:', err);
            } else {
                console.log('Verification (rows updated):');
                console.log(rows);
            }
            process.exit(0);
        });
    });
}

runMigration();
