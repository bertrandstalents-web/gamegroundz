const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Navigate to local server
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });
  
  // Attach error listeners
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  // Open modal
  await page.click('#login-btn');
  await page.waitForSelector('#auth-modal', { visible: true });
  
  // Fill form
  await page.type('#auth-email', 'erik.lupien@gmail.com');
  await page.type('#auth-password', 'Password123!');
  
  // Click
  console.log('Clicking continue...');
  await page.click('#auth-submit-btn');
  
  // Wait a moment
  await new Promise(r => setTimeout(r, 1000));
  
  // Fetch text of error and button
  const errText = await page.$eval('#auth-error', el => el.textContent);
  const errClass = await page.$eval('#auth-error', el => el.className);
  const btnText = await page.$eval('#auth-submit-btn', el => el.textContent);
  
  console.log('Error Text:', errText);
  console.log('Error Classes:', errClass);
  console.log('Button Text:', btnText.trim());
  
  await browser.close();
})();
