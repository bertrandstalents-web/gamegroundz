const fs = require('fs');
const content = fs.readFileSync('facility.html', 'utf8');

const startIndex = content.indexOf('// Booking Widget Logic');
const fetchIndex = content.indexOf('// --- FETCH FACILITY DATA ---');

if (startIndex === -1 || fetchIndex === -1) {
    console.error("Could not find markers.");
    process.exit(1);
}

// Remove the calendar rendering logic at the bottom
const renderCalStart = content.indexOf('function renderCalendar() {');
const renderCalEnd = content.indexOf('// Sync initial calendar render');
const renderCalEndBlock = content.indexOf('});\n    </script>', renderCalEnd);

let newContent = content.substring(0, startIndex);
newContent += content.substring(fetchIndex, renderCalStart);

// At the end of the fetch block, we had:
//                     // Sync initial calendar render
//                     updatePeriodDisplay();
// 
//                     // Initial render call for booking widget
// ...
//                 });
//             } else {
//                 render();
//             }
//         });
//     </script>

// We need to clean up the end of the DOMContentLoaded block.
// Instead of complex string manipulation, I'll just write a cleaner version of the script.
