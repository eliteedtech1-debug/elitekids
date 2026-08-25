const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:34601';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

// Routes that actually exist in App.tsx
const TEACHER_PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'teacher-lessons', path: '/teacher/lessons' },
  { name: 'teacher-approvals', path: '/teacher/approvals' },
  { name: 'teacher-create-game', path: '/teacher/create-game' },
  { name: 'admin-assets', path: '/admin/assets' },
  { name: 'parent-children', path: '/parent' },
  { name: 'parent-activities', path: '/parent/activities' },
];

const STUDENT_PAGES = [
  { name: 'student-home', path: '/student' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function screenshot(page, vpName, pageName) {
  const dir = path.join(SCREENSHOT_DIR, vpName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${pageName}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  const size = fs.statSync(filePath).size;
  console.log(`  📸 ${vpName}/${pageName}.png (${(size / 1024).toFixed(0)}KB)`);
  return filePath;
}

(async () => {
  console.log('🚀 Browser test — real routes @ 3 viewports\n');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Get valid token from API
  const tokenRaw = execSync(
    `curl -s http://localhost:34600/users/login -H "Content-Type: application/json" -d '{"username":"admin","password":"123456"}'`
  ).toString();
  const loginData = JSON.parse(tokenRaw);
  const token = loginData.token.replace(/^Bearer\s+/i, '');
  const schoolId = loginData.school_id;
  console.log(`🔑 Token acquired (school: ${schoolId})\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ─── Login page screenshots ─────────────────────────────────
  console.log('═══ Login Page ═══');
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(2000);
    await screenshot(page, vpName, '01-login');

    // Fill school, email, password
    const schoolInput = await page.$('input[name="school_id"]');
    if (schoolInput) {
      await schoolInput.click({ clickCount: 3 });
      await page.keyboard.type('DKG');
      await page.keyboard.press('Tab');
      await sleep(2500);
    }
    const emailInput = await page.$('input[name="email"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await page.keyboard.type('admin');
    }
    const pwInput = await page.$('input[name="password"]');
    if (pwInput) {
      await pwInput.click({ clickCount: 3 });
      await page.keyboard.type('123456');
    }
    await sleep(500);
    await screenshot(page, vpName, '01-login-filled');
    await page.close();
  }

  // ─── Authenticated pages at all viewports ──────────────────
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    console.log(`\n═══ Pages @ ${vpName} (${vp.width}×${vp.height}) ═══`);
    const page = await browser.newPage();
    await page.setViewport(vp);

    // Set auth via localStorage
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 10000 });
    await page.evaluate((tok, sid) => {
      localStorage.setItem('@@auth_token', tok);
      localStorage.setItem('school_id', sid);
      localStorage.setItem('user_data', JSON.stringify({ user_type: 'Admin' }));
    }, token, schoolId);

    for (const pg of TEACHER_PAGES) {
      try {
        await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 12000 });
        await sleep(2500);

        if (page.url().includes('/login') || page.url().includes('/dashboard')) {
          // Check if redirected (which is expected for some pages based on school)
          const finalUrl = page.url();
          const wasRedirect = !finalUrl.endsWith(pg.path);
          if (wasRedirect) {
            console.log(`  ↩️  ${pg.name} → redirected to ${finalUrl.replace(BASE_URL, '')}`);
            // Still screenshot the redirect destination
            await screenshot(page, vpName, `02-${pg.name}-redirect`);
            continue;
          }
        }

        await screenshot(page, vpName, `02-${pg.name}`);
      } catch (err) {
        console.log(`  ⚠️  ${pg.name} — ${err.message.slice(0, 80)}`);
      }
    }

    // Student pages
    for (const pg of STUDENT_PAGES) {
      try {
        await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: 'networkidle2', timeout: 12000 });
        await sleep(2500);
        await screenshot(page, vpName, `03-${pg.name}`);
      } catch (err) {
        console.log(`  ⚠️  ${pg.name} — ${err.message.slice(0, 80)}`);
      }
    }

    await page.close();
  }

  await browser.close();

  // ─── Summary ────────────────────────────────────────────────
  const files = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push(full.replace(SCREENSHOT_DIR + '/', ''));
    }
  }
  walk(SCREENSHOT_DIR);
  console.log(`\n✅ ${files.length} screenshots saved:`);
  files.forEach(f => console.log(`  ${f}`));
})();
