const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Intercept network
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('login') || req.url().includes('auth') || req.url().includes('school')) {
      requests.push({ type: 'REQ', url: req.url(), method: req.method(), body: req.postData() });
    }
  });
  page.on('response', res => {
    if (res.url().includes('login') || res.url().includes('auth') || res.url().includes('school')) {
      res.text().then(text => {
        requests.push({ type: 'RES', url: res.url(), status: res.status(), body: text.slice(0, 500) });
      }).catch(() => {});
    }
  });

  await page.goto('http://localhost:34601/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(2000);

  // Check if school short name input exists
  const schoolInputExists = await page.evaluate(() => !!document.querySelector('input[name="school_id"]'));
  console.log('School input exists:', schoolInputExists);

  if (schoolInputExists) {
    const schoolInput = await page.$('input[name="school_id"]');
    await schoolInput.click({ clickCount: 3 });
    await page.keyboard.type('BLOSSOM');
    await sleep(500);
    await page.keyboard.press('Tab');
    await sleep(3000);
    console.log('School resolved');
  }

  // Fill email
  const emailInput = await page.$('input[name="email"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await page.keyboard.type('admin');
  }

  // Fill password
  const pwInput = await page.$('input[name="password"]');
  if (pwInput) {
    await pwInput.click({ clickCount: 3 });
    await page.keyboard.type('123456');
  }

  await sleep(1000);

  // Check form state
  const formState = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return Array.from(inputs).map(i => ({ name: i.name, value: i.value, type: i.type }));
  });
  console.log('Form state:', JSON.stringify(formState));

  // Check submit button
  const btnState = await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn ? { disabled: btn.disabled, text: btn.textContent } : null;
  });
  console.log('Submit button:', JSON.stringify(btnState));

  // Click submit
  await page.click('button[type="submit"]');
  await sleep(5000);

  console.log('\n=== AFTER SUBMIT ===');
  console.log('URL:', page.url());
  console.log('Network requests:');
  requests.forEach(r => console.log(`  ${r.type} ${r.method||''} ${r.status||''} ${r.url} ${r.body||''}`.trim()));

  // Check page content
  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('\nPage text:', pageText);

  await page.screenshot({ path: '/Users/elite/Downloads/apps/elite/elite-kids/screenshots/debug-login.png' });
  await browser.close();
})();
