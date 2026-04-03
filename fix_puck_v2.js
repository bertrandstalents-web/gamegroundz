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

    // In my previous script, I created this structure:
    // <!-- Desktop Menu -->
    // <div class="hidden md:flex ...">
    //     ... links ...
    //     <div class="h-6 w-px bg-slate-300"></div>
    //     <a href="owner-dashboard.html" id="list-facility-btn" ...>List Your Facility</a>
    // </div>
    // 
    // <!-- Right Mobile/Desktop Header Section -->
    // <div class="flex items-center space-x-3 md:space-x-4 ml-4 md:ml-6">
    //     ... puck ...
    //     ... mobile menu button ...
    // </div>
    // 
    // Let's grab the Desktop Menu content
    const desktopStart = content.indexOf('<!-- Desktop Menu -->');
    if (desktopStart === -1) continue;
    
    // Find the end of desktop menu logic
    const desktopDivStart = content.indexOf('<div class="hidden md:flex', desktopStart);
    if (desktopDivStart === -1) continue;
    
    // The desktop div ends right before <!-- Right Mobile/Desktop Header Section -->
    const rightSectionStart = content.indexOf('<!-- Right Mobile/Desktop Header Section -->');
    if (rightSectionStart === -1) continue;
    
    // Find the end of the Right Mobile/Desktop Header Section.
    // It's followed by </div> </div> for the navbar ending.
    // Let's find the puck and mobile menu inside it.
    let rightSectionEnd = content.indexOf('</div>\n            </div>\n        </div>', rightSectionStart);
    if (rightSectionEnd === -1) {
        rightSectionEnd = content.indexOf('</div>\n            </div>\n    </nav>', rightSectionStart);
        if (rightSectionEnd === -1) {
             rightSectionEnd = content.indexOf('</div>\n        </div>\n    </nav>', rightSectionStart);
             if (rightSectionEnd === -1) {
                 // Try to locate the exact end of the right side div.
                 let search = content.indexOf('<!-- Mobile Menu', rightSectionStart);
                 if (search === -1) search = rightSectionStart;
                 // Find 2 closing divs after it?
                 rightSectionEnd = content.indexOf('</div>', search);
                 rightSectionEnd = content.indexOf('</div>', rightSectionEnd + 1);
             }
        }
    }
    
    // Wait, parsing HTML with indexOf is getting messy. We want to unify the two blocks by creating ONE wrapper.
    // Instead of parsing, let's just use string replace.
    
    // Let's find the separator and the "List your facility" button
    let desktopBlockStr = content.substring(desktopStart, rightSectionStart);
    
    // Extract List Your facility button, we'll give it hidden md:block or hidden md:inline-block
    let listFacilityBtn = '';
    const btnRegex = /<a[^>]*owner-dashboard.html[^>]*>[^<]*List Your Facility[^<]*<\/a>/i;
    const match = desktopBlockStr.match(btnRegex);
    if (match) {
        listFacilityBtn = match[0];
        // Add hidden md:inline-block to it if it doesn't have it
        if (!listFacilityBtn.includes('hidden md:')) {
            listFacilityBtn = listFacilityBtn.replace('class="', 'class="hidden md:inline-block ');
        }
        desktopBlockStr = desktopBlockStr.replace(match[0], ''); // Remove from desktop block
    }
    
    // Extract puck block
    const puckStart = content.indexOf('<!-- Profile Puck -->');
    let puckEnd = content.indexOf('<!-- Mobile Menu Button');
    if (puckEnd === -1) puckEnd = content.indexOf('<!-- Mobile', puckStart);
    if (puckEnd === -1) puckEnd = content.indexOf('</div>\n            </div>', puckStart); // End of nav
    if (puckEnd === -1) puckEnd = content.indexOf('\n                </div>\n            </div>', puckStart); // End of nav
    
    // Just find the block starting with <!-- Profile Puck --> to the end of the puck-dropdown </div>
    // Let's find `<button id="puck-logout"` and count 3 closing divs
    const logoutBtnIndex = content.indexOf('<button id="puck-logout"');
    if (logoutBtnIndex === -1) continue; // Skip if no puck
    
    let searchIndex = logoutBtnIndex;
    for(let i=0; i<3; i++) {
        searchIndex = content.indexOf('</div>', searchIndex + 1);
    }
    const realPuckEnd = searchIndex + 6;
    const puckContent = content.substring(puckStart, realPuckEnd);
    
    // Now extract the mobile menu button (if it exists)
    let mobileMenuContent = '';
    let mobileStart = content.indexOf('<!-- Mobile Menu Button');
    
    // Let's just reconstruct everything cleanly starting from <!-- Desktop Menu -->
    // We'll replace from desktopStart all the way down to the closing of the header flex container.
    // Let's find the closing of `h-20` wrapper or similar.
    // It's usually the `</div>` before `<!-- Mobile Menu (Hidden by default) -->`
    let navEndIdx = content.indexOf('<!-- Mobile Menu (Hidden by default) -->');
    if (navEndIdx === -1) navEndIdx = content.indexOf('</nav>'); // Fallback
    
    // Locate the `</div>\n            </div>` that closes `.flex.justify-between.items-center.h-20`
    let replaceEnd = content.lastIndexOf('</div>', navEndIdx - 1);
    replaceEnd = content.lastIndexOf('</div>', replaceEnd - 1) + 6;
    
    if (file === 'owner-dashboard.html' || file === 'player-dashboard.html') {
         replaceEnd = navEndIdx; // Use the </nav> offset for dashboards if it's there
    }
    
    // Clean up DesktopBlockStr (remove trailing </div>)
    let innerDesktop = desktopBlockStr.replace('<!-- Desktop Menu -->', '').trim();
    if (innerDesktop.startsWith('<div class="hidden md:flex items-center space-x-')) {
         const classesMatch = innerDesktop.match(/class="(.*?)"/);
         let cls = classesMatch ? classesMatch[1] : "hidden md:flex items-center space-x-8";
         // We'll extract just the contents of innerDesktop
         let innerOnly = innerDesktop.replace(/<div class="hidden md:flex[^>]*>/, '');
         innerOnly = innerOnly.substring(0, innerOnly.lastIndexOf('</div>')).trim();
         
         desktopBlockStr = `<!-- Desktop Only Links -->
                    <div class="${cls}">
                        ${innerOnly}
                    </div>`;
    }

    // Now extract mobile Menu manually again. Usually it's in <!-- Mobile Menu Button --> <div class="..."> <button ...> ... </div> </div>
    let mobileCode = '';
    if (mobileStart !== -1 && mobileStart < replaceEnd) {
         let mmEnd = content.indexOf('</div>', content.indexOf('<button', mobileStart));
         mmEnd = content.indexOf('</div>', mmEnd + 1) + 6;
         mobileCode = content.substring(mobileStart, mmEnd).trim();
    }
    
    const newCombinedBlock = `<!-- Right Side Navigation Container -->
                <div class="flex items-center space-x-4 md:space-x-8">
                    ${desktopBlockStr}
                    
                    ${puckContent}
                    
                    ${listFacilityBtn}
                    
                    ${mobileCode}
                </div>`;
                
    const finalHTML = content.substring(0, desktopStart) + newCombinedBlock + '\n            </div>\n        ' + content.substring(replaceEnd);
    
    fs.writeFileSync(file, finalHTML);
    console.log("Updated", file);
}

