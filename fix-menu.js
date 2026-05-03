const fs = require('fs');
const glob = require('glob'); // use standard fs approach instead to avoid dependency
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove hamburger button
    content = content.replace(/\s*<!-- Hamburger Button -->\s*<button class="hamburger-btn"[^>]*>\s*<i class="fa-solid fa-bars"><\/i>\s*<\/button>/g, '');
    
    // Remove "The legacy mobile-menu div has been removed" comment
    content = content.replace(/\s*<!-- The legacy mobile-menu div has been removed in favor of vanilla CSS \.nav-open drawer -->/g, '');
    
    // Remove the event listener that closes nav-open
    content = content.replace(/\s*\/\/\s*Outside click to close mobile menu[\s\S]*?document\.body\.classList\.remove\('nav-open'\);\s*\}\s*\}\);/g, '');

    fs.writeFileSync(file, content);
});

// Also fix css/style.css
let css = fs.readFileSync('css/style.css', 'utf8');
css = css.replace(/\/\* Mobile Hamburger Menu \*\/[\s\S]*?\}\s*\}\s*$/m, `@media (max-width: 768px) {
    .nav-links, .admin-sidebar {
        display: none !important;
    }
}`);
fs.writeFileSync('css/style.css', css);

console.log('Reverted hamburger menu.');
