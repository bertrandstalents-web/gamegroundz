const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const target1 = `    db.get(\`
        SELECT f.name, f.location, f.base_price, f.pricing_rules, f.has_processing_fee, f.processing_fee_amount, u.stripe_account_id, u.stripe_onboarding_complete 
        FROM facilities f 
        JOIN users u ON f.host_id = u.id 
        WHERE f.id = ?
    \`, [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, allDiscounts) => {`;

const replacement1 = `    db.get(\`
        SELECT f.name, f.location, f.base_price, f.pricing_rules, f.has_processing_fee, f.processing_fee_amount, u.stripe_account_id, u.stripe_onboarding_complete 
        FROM facilities f 
        JOIN users u ON f.host_id = u.id 
        WHERE f.id = ?
    \`, [facility_id], (err, facility) => {
        if (err || !facility) return res.status(404).json({ error: "Facility not found" });

        const requestSurfaceId = req.body.surface_id || null;

        const fetchSurfacePricing = (cb) => {
            if (requestSurfaceId) {
                db.get("SELECT name as surface_name, base_price, pricing_rules FROM surfaces WHERE id = ?", [requestSurfaceId], (err, surface) => {
                    if (err || !surface) {
                        return cb(facility);
                    }
                    cb({
                        ...facility,
                        name: \`\${facility.name} - \${surface.surface_name}\`,
                        base_price: surface.base_price,
                        pricing_rules: surface.pricing_rules
                    });
                });
            } else {
                cb(facility);
            }
        };

        fetchSurfacePricing((facility) => {
            db.all("SELECT * FROM discounts WHERE facility_id = ? OR facility_id IS NULL", [facility_id], (err, allDiscounts) => {`;

if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    console.log("Replaced target 1");
}

const target2 = `                    const payloadToStore = JSON.stringify({
                        user_id,
                        facility_id,
                        multi_day_slots: parsedMultiDaySlots
                    });`;

const replacement2 = `                    const payloadToStore = JSON.stringify({
                        user_id,
                        facility_id,
                        surface_id: requestSurfaceId,
                        multi_day_slots: parsedMultiDaySlots
                    });`;

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    console.log("Replaced target 2");
}

const target3 = "cancel_url: `${sessionUrl}/facility.html?id=${facility_id}&canceled=true`,";
const replacement3 = "cancel_url: requestSurfaceId ? `${sessionUrl}/surface.html?id=${requestSurfaceId}&canceled=true` : `${sessionUrl}/facility.html?id=${facility_id}&canceled=true`,";

if (content.includes(target3)) {
    content = content.replace(target3, replacement3);
    console.log("Replaced target 3");
}

// Now we need to add the closing bracket for fetchSurfacePricing
// We look for the end of the create-checkout-session endpoint.
const target4 = `                    }); // END pending_checkouts insert callback
                }
            );
        });
    });
});`;

const replacement4 = `                    }); // END pending_checkouts insert callback
                }
            );
        });
        });
    });
});`;

if (content.includes(target4)) {
    content = content.replace(target4, replacement4);
    console.log("Replaced target 4");
}

fs.writeFileSync('server.js', content, 'utf8');
console.log("Done");
