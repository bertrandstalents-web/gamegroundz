const puppeteer = require('/Users/mark/gamegroundz/node_modules/puppeteer');
const path = require('path');
const fs = require('fs');

const targetLang = process.argv[2] || 'fr';
const outputDir = path.join(__dirname, '..', 'screenshots', 'translations', targetLang);

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

(async () => {
    console.log(`Starting translation validation for language: "${targetLang}"`);
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        // 1. Setup local storage and cookies on load
        console.log('Setting up language cookies/storage on local domain...');
        await page.goto('http://localhost:3000/404.html', { waitUntil: 'networkidle2' });
        
        await page.evaluate((lang) => {
            localStorage.setItem('gg_language', lang);
        }, targetLang);

        const expectedCookieVal = targetLang === 'en' ? '/en/en' : `/en/${targetLang}`;
        await page.setCookie({
            name: 'googtrans',
            value: expectedCookieVal,
            domain: 'localhost',
            path: '/'
        });

        // 2. Load Homepage
        console.log('Navigating to homepage...');
        await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle2' });
        await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));

        // Dismiss cookie banner
        const cookieBtn = await page.$('#cookie-accept-btn');
        if (cookieBtn) {
            await cookieBtn.click();
            await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        }

        const homePath = path.join(outputDir, 'homepage.png');
        await page.screenshot({ path: homePath });
        console.log(`Saved homepage screenshot to: ${homePath}`);

        // Sanity check homepage lang attribute
        const homeLangAttr = await page.evaluate(() => document.documentElement.getAttribute('data-lang'));
        console.log(`[CHECK] Homepage data-lang attribute: "${homeLangAttr}" (Expected: "${targetLang}")`);

        // 3. Load Search Page
        console.log('Navigating to search page...');
        await page.goto('http://localhost:3000/search.html', { waitUntil: 'networkidle2' });
        await page.evaluate(() => new Promise(r => setTimeout(r, 2000)));
        
        const searchPath = path.join(outputDir, 'search.png');
        await page.screenshot({ path: searchPath });
        console.log(`Saved search page screenshot to: ${searchPath}`);

        // 4. Log in as player to verify Player Dashboard
        console.log('Logging in as player marenaud66@gmail.com...');
        await page.goto('http://localhost:3000/index.html?login=true', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#auth-email', { timeout: 5000 });
        await page.type('#auth-email', 'marenaud66@gmail.com');
        await page.type('#auth-password', 'password123');

        // Submit and handle potential language reload
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
            page.evaluate(() => document.getElementById('auth-submit-btn').click())
        ]);
        await page.evaluate(() => new Promise(r => setTimeout(r, 3000))).catch(() => {});

        console.log('Navigating to player dashboard...');
        await page.goto('http://localhost:3000/player-dashboard.html', { waitUntil: 'networkidle2' });
        await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));

        // Open profile puck dropdown
        await page.waitForSelector('#profile-puck-btn', { timeout: 5000 });
        await page.click('#profile-puck-btn');
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

        const playerDashPath = path.join(outputDir, 'player-dashboard.png');
        await page.screenshot({ path: playerDashPath });
        console.log(`Saved player dashboard screenshot to: ${playerDashPath}`);

        // Log out
        console.log('Logging out...');
        await page.click('#nav-logout-btn');
        await page.evaluate(() => new Promise(r => setTimeout(r, 3000))).catch(() => {});

        // 5. Log in as host to verify Host Dashboard
        console.log('Logging in as host renaudtristan11@gmail.com...');
        await page.goto('http://localhost:3000/index.html?login=true', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#auth-email', { timeout: 5000 });
        await page.type('#auth-email', 'renaudtristan11@gmail.com');
        await page.type('#auth-password', 'password123');

        // Submit
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
            page.evaluate(() => document.getElementById('auth-submit-btn').click())
        ]);
        await page.evaluate(() => new Promise(r => setTimeout(r, 3000))).catch(() => {});

        console.log('Navigating to host dashboard...');
        await page.goto('http://localhost:3000/owner-dashboard.html', { waitUntil: 'networkidle2' });
        await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));

        // Open profile puck dropdown
        await page.waitForSelector('#profile-puck-btn', { timeout: 5000 });
        await page.click('#profile-puck-btn');
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

        const hostDashPath = path.join(outputDir, 'host-dashboard.png');
        await page.screenshot({ path: hostDashPath });
        console.log(`Saved host dashboard screenshot to: ${hostDashPath}`);

        // Perform translation audit (looking for untranslated text nodes on host dashboard)
        const auditResult = await page.evaluate((lang) => {
            if (lang === 'en') return { success: true, warnings: [] };
            
            const warnings = [];
            // Common English words that must be translated in French view
            const forbiddenWords = ['Welcome', 'Upcoming Reservations', 'My Bookings', 'Manage Surfaces', 'Log out'];
            
            function walk(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.trim();
                    if (text) {
                        for (const word of forbiddenWords) {
                            if (text.includes(word)) {
                                // Exclude translate-ignore nodes
                                let parent = node.parentElement;
                                let isIgnored = false;
                                while (parent) {
                                    if (parent.classList.contains('notranslate') || parent.getAttribute('data-no-translate')) {
                                        isIgnored = true;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                }
                                if (!isIgnored) {
                                    warnings.push(`Untranslated word "${word}" found in: "${text}"`);
                                }
                            }
                        }
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Skip script, style, Choices dropdown elements, etc.
                    const tag = node.tagName.toLowerCase();
                    if (tag !== 'script' && tag !== 'style' && !node.classList.contains('choices__list')) {
                        for (const child of node.childNodes) {
                            walk(child);
                        }
                    }
                }
            }
            walk(document.body);
            return { success: warnings.length === 0, warnings };
        }, targetLang);

        console.log('\n=======================================');
        console.log(`Translation Audit Result for "${targetLang}":`);
        if (auditResult.success) {
            console.log('✅ PASS - No untranslated English elements detected!');
        } else {
            console.log('⚠️ WARNING - Some untranslated English elements were detected:');
            auditResult.warnings.forEach(w => console.log(`  - ${w}`));
        }
        console.log('=======================================\n');

        await browser.close();
        console.log('Translation validation complete!');
    } catch (err) {
        console.error('Error in script:', err);
        if (browser) await browser.close();
    }
})();
