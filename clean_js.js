const fs = require('fs');
let content = fs.readFileSync('facility.html', 'utf8');

const puckEnd = content.indexOf('// Booking Widget Logic');
const fetchStart = content.indexOf('// --- FETCH FACILITY DATA ---');

let beforeFetch = content.substring(0, puckEnd);
let afterFetch = content.substring(fetchStart);

// Inside afterFetch, we need to remove calendar rendering.
const renderCalStart = afterFetch.indexOf('function renderCalendar() {');
const scriptEnd = afterFetch.indexOf('</script>', renderCalStart);

let finalAfterFetch = afterFetch.substring(0, renderCalStart) + '        });\n    ' + afterFetch.substring(scriptEnd);

// Also remove `updateSurfaceUI` price update logic which references undefined functions.
// find `function updateSurfaceUI(surface) {`
const updateUIStart = finalAfterFetch.indexOf('function updateSurfaceUI(surface) {');
const updateUIEnd = finalAfterFetch.indexOf('}', updateUIStart);
// Replace its content with empty or just remove it if it's useless
// Actually, `updateSurfaceUI` is totally useless now since we removed the widget DOM.
// But it might be called in surface switcher.
// Let's just use string replace.

fs.writeFileSync('facility.html.tmp', beforeFetch + finalAfterFetch);
