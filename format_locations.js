const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const replacements = [
    { search: /\$\{facility\.effective_location\s*\|\|\s*facility\.location\s*\|\|\s*'[^']*'\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(facility.effective_location || facility.location) : (facility.effective_location || facility.location || 'Location unavailable')}" },
    { search: /\$\{facility\.effective_location\s*\|\|\s*facility\.location\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(facility.effective_location || facility.location) : (facility.effective_location || facility.location)}" },
    { search: /\$\{session\.location\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(session.location) : session.location}" },
    { search: /\$\{booking\.location\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(booking.location) : booking.location}" },
    { search: /\$\{facility\.location\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(facility.location) : facility.location}" },
    { search: /\$\{f\.location\}/g, replace: "${typeof formatShortLocation === 'function' ? formatShortLocation(f.location) : f.location}" },
    { search: /\$\{fac\.location \? fac\.location\.split\(\',\/\)\[0\] : \'Location not set\'\}/g, replace: "${fac.location ? (typeof formatShortLocation === 'function' ? formatShortLocation(fac.location) : fac.location.split(',')[0]) : 'Location not set'}" }
];

files.forEach(file => {
    const p = path.join(dir, file);
    let content = fs.readFileSync(p, 'utf8');
    let original = content;
    
    replacements.forEach(r => {
        content = content.replace(r.search, r.replace);
    });

    if (content !== original) {
        fs.writeFileSync(p, content, 'utf8');
        console.log(`Updated location format in ${file}`);
    }
});
