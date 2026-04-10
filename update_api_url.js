const fs = require('fs');
const path = require('path');

const dir = __dirname;
const target = "const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';";
const replacement = "const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';";

function processDir(directory) {
    const files = fs.readdirSync(directory);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'server.js') continue;
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.html') || file.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(target)) {
                content = content.split(target).join(replacement);
                fs.writeFileSync(fullPath, content);
                console.log('Updated ' + fullPath);
            }
        }
    }
}

processDir(dir);
