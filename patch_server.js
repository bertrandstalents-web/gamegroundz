const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');

let newContent = content.replace(
    /(\/\/ Secure Pricing Calculation\n\s+db\.get\(`[\s\S]+?)(db\.all\("SELECT \* FROM discounts WHERE facility_id = \? OR facility_id IS NULL", \[facility_id\], \(err, allDiscounts\) => \{)/,
    `$1const requestSurfaceId = req.body.surface_id || null;

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
            $2`
);

newContent = newContent.replace(
    /const payloadToStore = JSON\.stringify\(\{\n\s+user_id,\n\s+facility_id,\n\s+multi_day_slots: parsedMultiDaySlots\n\s+\}\);/,
    `const payloadToStore = JSON.stringify({
                        user_id,
                        facility_id,
                        surface_id: requestSurfaceId,
                        multi_day_slots: parsedMultiDaySlots
                    });`
);

newContent = newContent.replace(
    /cancel_url: \`\$\{sessionUrl\}\/facility\.html\?id=\$\{facility_id\}&canceled=true\`/,
    "cancel_url: requestSurfaceId ? `${sessionUrl}/surface.html?id=${requestSurfaceId}&canceled=true` : `${sessionUrl}/facility.html?id=${facility_id}&canceled=true`"
);

// We need to close the fetchSurfacePricing bracket at the end of the db.get callback
newContent = newContent.replace(
    /\}\);\n\s+\}\);\n\}\);/,
    `});\n            });\n        });\n    });\n});`
);

// Actually, wait, replacing the end of db.get might be tricky because there are a lot of nested callbacks. Let's fix that.
// The original end was:
//                     } catch (stripeErr) {
//                         // ...
//                     }
//                     }); // END pending_checkouts insert callback
//                 }
//             );
//         });
//     });
// });

