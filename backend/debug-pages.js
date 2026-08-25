const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Get token
  const raw = execSync(`curl -s http://localhost:34600/users/login -H "Content-Type: application/json" -d '{"username":"admin","password":"123456"}'`).toString();
  const data = JSON.parse(raw);
  const token = data.token.replace(/^Bearer\s+/i, '');
  const schoolId = data.school_id;
  console.log(`Token for school ${schoolId}`);

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Set localStorage on blank page first
  await page.goto('http://localhost:34601', { waitUntil: 'networkidle2', timeout: 10000 });
  await sleep(1000);

  // Check what's currently in localStorage
  const existing = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key)?.slice(0, 100);
    }
    return items;
  });
  console.log('Existing localStorage:', JSON.stringify(existing, null, 2));

  // Set auth
  await page.evaluate((tok, sid) => {
    localStorage.setItem('@@auth_token', tok);
    localStorage.setItem('school_id', sid);
    localStorage.setItem('user_data', JSON.stringify({ user_type: 'Admin' }));
  }, token, schoolId);

  // Verify it was set
  const verify = await page.evaluate(() => ({
    token: localStorage.getItem('@@auth_token')?.slice(0, 40),
    schoolId: localStorage.getItem('school_id'),
    userData: localStorage.getItem('user_data'),
  }));
  console.log('After setting:', JSON.stringify(verify, null, 2));

  // Navigate to dashboard
  await page.goto('http://localhost:34601/dashboard', { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(3000);

  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Page text:', text);

  // Check for errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Take screenshot
  await page.screenshot({ path: '/Users/elite/Downloads/apps/elite/elite-kids/screenshots/debug-dashboard.png' });

  // Try game creator
  await page.goto('http://localhost:34601/game-creator?template=matching', { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(3000);
  console.log('\nGame Creator URL:', page.url());
  const gcText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('Game Creator text:', gcText);
  await page.screenshot({ path: '/Users/elite/Downloads/apps/elite/elite-kids/screenshots/debug-game-creator.png' });

  await browser.close();
})();
