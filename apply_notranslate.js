const fs = require('fs');
const path = require('path');

const htmlFiles = [
    'index.html',
    'search.html',
    'facility.html',
    'player-dashboard.html',
    'owner-dashboard.html',
    'admin-dashboard.html',
    'receipt.html',
    'how-it-works.html',
    '404.html'
];

let modifiedFiles = 0;

for (const file of htmlFiles) {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) continue;
    
    let content = fs.readFileSync(p, 'utf8');
    let originalContent = content;

    // 1. Navbar and Footer Logo:
    content = content.replace(
        /<span class="font-bold text-2xl tracking-tight text-dark">Game<span class="text-primary">Groundz<\/span><\/span>/g,
        '<span class="font-bold text-2xl tracking-tight text-dark notranslate">Game<span class="text-primary">Groundz</span></span>'
    );
    content = content.replace(
        /<span class="font-bold text-2xl tracking-tight text-white">Game<span class="text-primary">Groundz<\/span><\/span>/g,
        '<span class="font-bold text-2xl tracking-tight text-white notranslate">Game<span class="text-primary">Groundz</span></span>'
    );
    
    // 2. "GameGroundz" text references (wrap in span that doesn't affect layout)
    content = content.replace(/GameGroundz Works/g, '<span class="notranslate">GameGroundz</span> Works');
    content = content.replace(/using GameGroundz/g, 'using <span class="notranslate">GameGroundz</span>');
    content = content.replace(/GameGroundz completely/g, '<span class="notranslate">GameGroundz</span> completely');
    content = content.replace(/\(c\) \d{4} GameGroundz/g, '(c) 2026 <span class="notranslate">GameGroundz</span>');
    content = content.replace(/© \d{4} GameGroundz/g, '© 2026 <span class="notranslate">GameGroundz</span>');
    content = content.replace(/Welcome to GameGroundz/g, 'Welcome to <span class="notranslate">GameGroundz</span>');
    content = content.replace(/>GameGroundz</g, '><span class="notranslate">GameGroundz</span><');
    content = content.replace(/ - GameGroundz/g, ' - <span class="notranslate">GameGroundz</span>');

    // 3. Facility Names in dynamic rendering:
    // index.html: `<h3 class="text-xl font-bold text-dark group-hover:text-primary transition-custom">${facility.name}</h3>`
    content = content.replace(
        /<h3 class="text-xl font-bold text-dark group-hover:text-primary transition-custom">\$\{facility\.name\}<\/h3>/g,
        '<h3 class="text-xl font-bold text-dark group-hover:text-primary transition-custom notranslate">${facility.name}</h3>'
    );
    
    // search.html: `<h3 class="text-2xl font-bold text-dark group-hover:text-primary transition-custom mb-2">${facility.name}</h3>`
    // Regex matching any class with facility.name
    content = content.replace(
        /<h3 class="text-2xl font-bold text-dark group-hover:text-primary transition-custom mb-2">\$\{facility\.name\}<\/h3>/g,
        '<h3 class="text-2xl font-bold text-dark group-hover:text-primary transition-custom mb-2 notranslate">${facility.name}</h3>'
    );

    // facility.html heading and subtitle (subtitle is the surface name)
    content = content.replace(
        /<h1 class="text-3xl font-extrabold text-dark tracking-tight mb-2">/g,
        '<h1 class="text-3xl font-extrabold text-dark tracking-tight mb-2 notranslate">'
    );
    content = content.replace(
        /<h2 class="text-2xl font-bold text-dark mb-2 border-b-0 pb-0" id="header-subtitle">/g,
        '<h2 class="text-2xl font-bold text-dark mb-2 border-b-0 pb-0 notranslate" id="header-subtitle">'
    );
    
    // owner-dashboard.html references to facility.name
    content = content.replace(
        /<h3 class="text-xl font-bold text-dark mb-2">\$\{facility\.name\}<\/h3>/g,
        '<h3 class="text-xl font-bold text-dark mb-2 notranslate">${facility.name}</h3>'
    );
    content = content.replace(
        /<h3 class="text-lg font-bold text-dark">\$\{facility\.name\}<\/h3>/g,
        '<h3 class="text-lg font-bold text-dark notranslate">${facility.name}</h3>'
    );
    // owner-dashboard.html bookings: `user_name`
    content = content.replace(
        /<div class="font-bold text-dark text-lg">\$\{b\.user_name \|\| 'Guest'\}<\/div>/g,
        '<div class="font-bold text-dark text-lg notranslate">${b.user_name || \'Guest\'}</div>'
    );
    
    // player-dashboard.html: `<h3 class="text-xl font-bold text-dark mb-1">${b.facility_name}</h3>`
    content = content.replace(
        /<h3 class="text-xl font-bold text-dark mb-1">\$\{b\.facility_name\}<\/h3>/g,
        '<h3 class="text-xl font-bold text-dark mb-1 notranslate">${b.facility_name}</h3>'
    );
    // player-dashboard facility name link
    content = content.replace(
        /<a href="facility\.html\?id=\$\{b\.facility_id\}" class="font-bold text-dark group-hover:text-primary transition-custom">\$\{b\.facility_name\}<\/a>/g,
        '<a href="facility.html?id=${b.facility_id}" class="font-bold text-dark group-hover:text-primary transition-custom notranslate">${b.facility_name}</a>'
    );
    
    // admin-dashboard.html lists all users and facilities
    content = content.replace(
        /<div class="font-bold text-dark">\$\{fac\.name\}<\/div>/g,
        '<div class="font-bold text-dark notranslate">${fac.name}</div>'
    );
    content = content.replace(
        /<td class="py-4 px-6 text-sm text-dark font-medium">\$\{res\.facility_name\}<\/td>/g,
        '<td class="py-4 px-6 text-sm text-dark font-medium notranslate">${res.facility_name}</td>'
    );

    // Specific ID overrides (using simplistic replace strings so we don't break existing class arrays)
    content = content.replace(/id="receipt-facility-name" class="/g, 'class="notranslate ');
    content = content.replace(/<h2 class="text-2xl font-bold text-dark mb-1" id="receipt-facility-name">/g, '<h2 class="text-2xl font-bold text-dark mb-1 notranslate" id="receipt-facility-name">');
    content = content.replace(/id="operator-name"/g, 'id="operator-name" class="notranslate"');
    content = content.replace(/id="modal-summary-text"/g, 'id="modal-summary-text" class="notranslate"');
    content = content.replace(/id="review-facility-name"/g, 'id="review-facility-name" class="notranslate"');
    
    // General text injection overrides
    content = content.replace(/titleEl\.textContent = facility\.name;/g, "titleEl.textContent = facility.name;\n                    titleEl.classList.add('notranslate');");

    if (content !== originalContent) {
        fs.writeFileSync(p, content, 'utf8');
        console.log(`Updated ${file}`);
        modifiedFiles++;
    }
}
console.log(`Modified ${modifiedFiles} files.`);
