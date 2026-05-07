const fs = require('fs');
let content = fs.readFileSync('surface.html', 'utf8');

const calendarLogicStart = content.indexOf('            // --- CALENDAR LOGIC ---');
const calendarLogicEnd = content.indexOf('            const calendarGrid = document.getElementById(\'calendar-grid\');', calendarLogicStart);

if (calendarLogicStart === -1 || calendarLogicEnd === -1) {
    console.error("Could not find calendar logic block");
    process.exit(1);
}

const calendarLogicBlock = content.substring(calendarLogicStart, calendarLogicEnd);

// Remove the block from its current position
content = content.substring(0, calendarLogicStart) + content.substring(calendarLogicEnd);

// Find insertion point
const insertPoint = content.indexOf('            const urlParams = new URLSearchParams(window.location.search);');

if (insertPoint === -1) {
    console.error("Could not find insertion point");
    process.exit(1);
}

// Insert the block
content = content.substring(0, insertPoint) + calendarLogicBlock + '\n' + content.substring(insertPoint);

fs.writeFileSync('surface.html', content);
console.log("Fixed selectedDateStr initialization location");
