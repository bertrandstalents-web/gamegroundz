const fs = require('fs');
const path = require('path');

const targetDir = '/Users/tommybertrand/.gemini/antigravity/scratch/GameGroundz_Project';

const replacements = [
    { regex: /Public Activities/g, replace: 'Public Activities' },
    { regex: /Public activities/g, replace: 'Public activities' },
    { regex: /public activities/g, replace: 'public activities' },
    { regex: /Public Activity/g, replace: 'Public Activity' },
    { regex: /Public activity/g, replace: 'Public activity' },
    { regex: /public activity/g, replace: 'public activity' },
    { regex: /Activités Publiques/g, replace: 'Activités Publiques' },
    { regex: /Activités publiques/g, replace: 'Activités publiques' },
    { regex: /activités publiques/g, replace: 'activités publiques' },
    { regex: /Activité Publique/g, replace: 'Activité Publique' },
    { regex: /Activité publique/g, replace: 'Activité publique' },
    { regex: /activité publique/g, replace: 'activité publique' }
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (stat.isFile() && /\.(html|js|css|md)$/.test(file)) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            for (const { regex, replace } of replacements) {
                if (regex.test(content)) {
                    content = content.replace(regex, replace);
                    modified = true;
                }
            }
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

processDirectory(targetDir);
console.log('Done.');
