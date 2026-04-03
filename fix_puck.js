const fs = require('fs');

const files = [
    'index.html',
    'search.html', 
    'player-dashboard.html',
    'owner-dashboard.html',
    'how-it-works.html',
    'about.html',
    'facility.html'
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');

    // We want to extract <!-- Profile Puck --> ... up to its closing </div> which ends right before <a href="owner-dashboard.html" or similar.
    // Let's use a regex to match the puck.
    const puckRegex = /[\s]*<!-- Profile Puck -->[\s]*<div class="relative flex items-center">[\s\S]*?<!-- Dropdown -->[\s\S]*?<div id="puck-dropdown"[\s\S]*?<\/div>[\s]*<\/div>[\s]*<\/div>[\s]*<!-- END PUCK OR SOMETHING -->/i;
    
    // Instead of regex, let's use string manipulation to find it exactly.
    const puckStart = content.indexOf('<!-- Profile Puck -->');
    if (puckStart === -1) {
        console.log(`Puck not found in ${file}`);
        continue;
    }
    
    // Find the end of the puck's outer container.
    // The puck's outer container is `<div class="relative flex items-center">`
    // We can just find the end of id="puck-logout" block, which ends with </button>\n</div>\n</div>\n</div>
    const logoutBtnIndex = content.indexOf('<button id="puck-logout"');
    if (logoutBtnIndex === -1) continue;
    
    // Find the third closing </div> after the logout button
    let searchIndex = logoutBtnIndex;
    for(let i=0; i<3; i++) {
        searchIndex = content.indexOf('</div>', searchIndex + 1);
    }
    const puckEnd = searchIndex + 6; // include </div>
    
    const puckContent = content.substring(puckStart, puckEnd);
    
    // Remove the puck from its original place
    content = content.substring(0, puckStart) + content.substring(puckEnd);
    
    // Now, we need to find the Mobile Menu Button block and wrap it with the puck.
    // The mobile menu button starts with <!-- Mobile Menu Button
    let mobileMenuStart = content.indexOf('<!-- Mobile Menu Button');
    if (mobileMenuStart === -1) {
        // If there's no mobile menu button, let's find the end of the Desktop Menu block
        // Desktop menu ends right before the closing </div> of <div class="flex justify-between items-center h-20">
        // Which is usually followed by </nav> or <div id="mobile-menu"
        const desktopMenuEnd = content.indexOf('<!-- Mobile Menu (Hidden by default) -->');
        if (desktopMenuEnd !== -1) {
             const insertPos = content.lastIndexOf('</div>\n            </div>', desktopMenuEnd);
             if (insertPos !== -1) {
                 const mobileBlock = `\n                <div class="flex items-center space-x-3 ml-2 md:ml-4">\n                    ${puckContent.trim().split('\\n').join('\\n                    ')}\n                </div>\n`;
                 content = content.substring(0, insertPos) + mobileBlock + content.substring(insertPos);
             }
        }
    } else {
        // We found the Mobile Menu Button.
        // It looks like:
        // <!-- Mobile Menu Button ... -->
        // <div class="... md:hidden ...">
        //   <button ...>
        // </div>
        let mobileMenuEnd = content.indexOf('</div>', content.indexOf('<button', mobileMenuStart));
        mobileMenuEnd = content.indexOf('</div>', mobileMenuEnd + 1) + 6; // End of the wrapper div
        
        const mobileMenuContent = content.substring(mobileMenuStart, mobileMenuEnd);
        
        // Remove it
        content = content.substring(0, mobileMenuStart) + content.substring(mobileMenuEnd);
        
        // Insert a combined block right there
        const combinedBlock = `
                <!-- Right Mobile/Desktop Header Section -->
                <div class="flex items-center space-x-3 md:space-x-4 ml-4 md:ml-6">
                    ${puckContent.trim().split('\n').join('\n                    ')}

                    ${mobileMenuContent.trim().split('\n').join('\n                    ')}
                </div>
`;
        // Insert back where mobileMenuStart used to be
        content = content.substring(0, mobileMenuStart) + combinedBlock + content.substring(mobileMenuStart);
    }
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
}
