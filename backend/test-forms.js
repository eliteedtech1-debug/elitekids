/**
 * E2E Test: Game Creator Forms
 * Tests all 6 game templates by filling in forms, submitting, and capturing screenshots.
 * Reports any errors found.
 */
const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:34601';
const API = 'http://localhost:34600';
const DIR = path.join(__dirname, '..', 'screenshots', 'game-creator-test');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const raw = execSync(`curl -s ${API}/users/login -H "Content-Type: application/json" -d '{"username":"admin","password":"123456"}'`).toString();
  const d = JSON.parse(raw);
  return { token: d.token.replace(/^Bearer\s+/i, ''), schoolId: d.school_id };
}

async function ss(page, name) {
  fs.mkdirSync(DIR, { recursive: true });
  const fp = path.join(DIR, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: false });
  console.log(`  📸 ${name}.png (${(fs.statSync(fp).size / 1024).toFixed(0)}KB)`);
}

async function typeIn(page, selector, text) {
  const el = await page.$(selector);
  if (!el) { console.log(`  ❌ Element not found: ${selector}`); return false; }
  await el.click({ clickCount: 3 });
  await page.keyboard.type(text, { delay: 10 });
  return true;
}

async function clickBtn(page, text) {
  const clicked = await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim().includes(t));
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  if (!clicked) console.log(`  ❌ Button not found: "${text}"`);
  return clicked;
}

// ─── Test templates ──────────────────────────────────────
const TESTS = [
  {
    name: 'matching',
    fill: async (page) => {
      // Step 0: Lesson info
      await typeIn(page, 'input[placeholder*="Counting"]', 'Match the Fruits');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'Fruits');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Step 1: Select matching template
      await clickBtn(page, 'Matching');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Step 2: Fill matching pairs
      // The form starts with 2 empty pairs, we need to fill them
      const inputs = await page.$$('input[placeholder*="Apple"], input[placeholder*="Banana"]');
      console.log(`  Found ${inputs.length} pair inputs`);

      // Fill Pair 1
      const allInputs = await page.$$('input[placeholder*="Apple"]');
      const rightInputs = await page.$$('input[placeholder*="Banana"]');

      // Use more generic selectors - find all text inputs in the form
      const textInputs = await page.$$('input[type="text"]');
      console.log(`  Found ${textInputs.length} text inputs total`);

      // Pair 1: Left, Right
      if (textInputs.length >= 4) {
        await textInputs[0].click({ clickCount: 3 });
        await page.keyboard.type('Apple', { delay: 10 });
        await textInputs[1].click({ clickCount: 3 });
        await page.keyboard.type('Red Apple', { delay: 10 });

        // Pair 2: Left, Right
        await textInputs[2].click({ clickCount: 3 });
        await page.keyboard.type('Banana', { delay: 10 });
        await textInputs[3].click({ clickCount: 3 });
        await page.keyboard.type('Yellow Banana', { delay: 10 });
      }
      await sleep(500);
    },
  },
  {
    name: 'tap-recognition',
    fill: async (page) => {
      await typeIn(page, 'input[placeholder*="Counting"]', 'Find the Animal');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'Animals');
      await clickBtn(page, 'Next');
      await sleep(500);

      await clickBtn(page, 'Tap Recognition');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Fill prompt
      await typeIn(page, 'input[placeholder*="Tap the"]', 'Tap the cat!');
      await sleep(300);

      // Fill option labels
      const labels = await page.$$('input[placeholder*="Answer label"]');
      console.log(`  Found ${labels.length} option labels`);
      const labelsArr = ['Cat', 'Dog', 'Bird'];
      for (let i = 0; i < Math.min(labels.length, labelsArr.length); i++) {
        await labels[i].click({ clickCount: 3 });
        await page.keyboard.type(labelsArr[i], { delay: 10 });
        await sleep(100);
      }

      // Mark first as correct
      await clickBtn(page, ''); // Click the first checkmark button
      await sleep(200);

      // Actually click the target/check circle for option 1
      const checkBtns = await page.$$('button[title="Mark as correct answer"]');
      console.log(`  Found ${checkBtns.length} checkmark buttons`);
      if (checkBtns.length > 0) {
        await checkBtns[0].click();
      }
      await sleep(500);
    },
  },
  {
    name: 'quiz',
    fill: async (page) => {
      await typeIn(page, 'input[placeholder*="Counting"]', 'Quiz: Colors');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'Art');
      await clickBtn(page, 'Next');
      await sleep(500);

      await clickBtn(page, 'Quiz');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Fill question
      await typeIn(page, 'input[placeholder*="What color"]', 'What color is the sky?');
      await sleep(300);

      // Fill options
      const opts = await page.$$('input[placeholder*="Answer text"]');
      console.log(`  Found ${opts.length} option inputs`);
      const colors = ['Blue', 'Red', 'Green'];
      for (let i = 0; i < Math.min(opts.length, colors.length); i++) {
        await opts[i].click({ clickCount: 3 });
        await page.keyboard.type(colors[i], { delay: 10 });
        await sleep(100);
      }

      // Mark first as correct
      const checkBtns = await page.$$('button[title="Mark as correct"]');
      if (checkBtns.length > 0) await checkBtns[0].click();
      await sleep(500);
    },
  },
  {
    name: 'drag-sort',
    fill: async (page) => {
      await typeIn(page, 'input[placeholder*="Counting"]', 'Number Order');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'Math');
      await clickBtn(page, 'Next');
      await sleep(500);

      await clickBtn(page, 'Drag');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Fill items
      const items = await page.$$('input[placeholder*="Item"]');
      console.log(`  Found ${items.length} sort items`);
      const nums = ['First', 'Second', 'Third'];
      for (let i = 0; i < Math.min(items.length, nums.length); i++) {
        await items[i].click({ clickCount: 3 });
        await page.keyboard.type(nums[i], { delay: 10 });
        await sleep(100);
      }
      await sleep(500);
    },
  },
  {
    name: 'fill-blank',
    fill: async (page) => {
      await typeIn(page, 'input[placeholder*="Counting"]', 'Fill the Blank');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'English');
      await clickBtn(page, 'Next');
      await sleep(500);

      await clickBtn(page, 'Fill');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Fill sentence with blank
      const sentenceInput = await page.$('textarea');
      if (sentenceInput) {
        await sentenceInput.click({ clickCount: 3 });
        await page.keyboard.type('The cat is sleeping on the ___.', { delay: 10 });
      }
      await sleep(500);

      // Fill blank answer
      const blankAnswers = await page.$$('input[placeholder*="Answer for blank"]');
      console.log(`  Found ${blankAnswers.length} blank answers`);
      if (blankAnswers.length > 0) {
        await blankAnswers[0].click({ clickCount: 3 });
        await page.keyboard.type('mat', { delay: 10 });
      }
      await sleep(300);

      // Add word bank items
      const addBtn = await page.$('button:has(> span)');
      // Click "Add" button in word bank section
      const addBtns = await page.$$('button');
      for (const btn of addBtns) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('Add') && !text.includes('___')) {
          await btn.click();
          await sleep(200);
          break;
        }
      }

      // Fill word bank inputs
      const bankInputs = await page.$$('input[placeholder="word"]');
      console.log(`  Found ${bankInputs.length} word bank inputs`);
      const words = ['mat', 'hat', 'cat'];
      for (let i = 0; i < Math.min(bankInputs.length, words.length); i++) {
        await bankInputs[i].click({ clickCount: 3 });
        await page.keyboard.type(words[i], { delay: 10 });
        // Click Add to add more
        if (i < words.length - 1) {
          for (const btn of await page.$$('button')) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text && text.trim() === 'Add') { await btn.click(); await sleep(200); break; }
          }
        }
      }
      await sleep(500);
    },
  },
  {
    name: 'puzzle',
    fill: async (page) => {
      await typeIn(page, 'input[placeholder*="Counting"]', 'Jigsaw Puzzle');
      await typeIn(page, 'input[placeholder*="Mathematics"]', 'Art');
      await clickBtn(page, 'Next');
      await sleep(500);

      await clickBtn(page, 'Puzzle');
      await clickBtn(page, 'Next');
      await sleep(500);

      // Fill image URL
      await typeIn(page, 'input[placeholder*="puzzle-image"]', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Abraham_Lincoln_O-77_matte_collodion_print.jpg/440px-Abraham_Lincoln_O-77_matte_collodion_print.jpg');
      await sleep(500);
    },
  },
];

(async () => {
  console.log('🎮 Game Creator E2E Form Test\n');

  const { token, schoolId } = await getToken();
  console.log(`🔑 Auth acquired (school: ${schoolId})\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];

  for (const test of TESTS) {
    console.log(`═══ Testing: ${test.name} ═══`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Set auth
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 10000 });
    await page.evaluate((tok, sid) => {
      localStorage.setItem('@@auth_token', tok);
      localStorage.setItem('school_id', sid);
      localStorage.setItem('user_data', JSON.stringify({ user_type: 'Admin' }));
    }, token, schoolId);

    // Listen for console errors and network failures
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

    // Intercept network errors
    const networkErrors = [];
    page.on('requestfailed', req => {
      networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });

    // Intercept responses for 4xx/5xx
    const badResponses = [];
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('favicon')) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    try {
      await page.goto(`${BASE}/teacher/create-game`, { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(2000);
      await ss(page, `${test.name}-01-form`);

      // Fill the form
      await test.fill(page);
      await ss(page, `${test.name}-02-filled`);

      // Check if "Next" button is enabled (form validation)
      const nextEnabled = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const next = btns.find(b => b.textContent.trim().includes('Next'));
        return next ? !next.disabled : null;
      });
      console.log(`  Next button enabled: ${nextEnabled}`);

      // Click Next (to step 3 - Scenes)
      if (nextEnabled) {
        await clickBtn(page, 'Next');
        await sleep(1000);
        await ss(page, `${test.name}-03-scenes`);

        // Click Review & Submit
        await clickBtn(page, 'Review');
        await sleep(1000);
        await ss(page, `${test.name}-04-review`);

        // Submit
        await clickBtn(page, 'Submit');
        await sleep(3000);
        await ss(page, `${test.name}-05-result`);

        // Check for success or error
        const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
        const hasSuccess = pageText.includes('Created') || pageText.includes('Success');
        const hasError = pageText.includes('Error') || pageText.includes('error') || pageText.includes('Failed');

        if (hasSuccess) {
          console.log(`  ✅ ${test.name}: SUCCESS`);
          results.push({ name: test.name, status: 'success', errors: [] });
        } else if (hasError) {
          console.log(`  ❌ ${test.name}: ERROR on page`);
          const errText = await page.evaluate(() => {
            const el = document.querySelector('.bg-red-50, [class*="error"], [class*="Error"]');
            return el ? el.textContent?.slice(0, 200) : 'unknown error';
          });
          console.log(`     Error: ${errText}`);
          results.push({ name: test.name, status: 'error', errors: [errText], pageErrors: errors, networkErrors, badResponses });
        } else {
          console.log(`  ⚠️  ${test.name}: UNCERTAIN (no clear success/error)`);
          results.push({ name: test.name, status: 'uncertain', errors: [], pageText: pageText.slice(0, 200) });
        }
      } else {
        console.log(`  ⚠️  ${test.name}: Form validation blocked (Next disabled)`);
        results.push({ name: test.name, status: 'validation-blocked', errors: [] });
      }

      // Log any errors
      if (errors.length) console.log(`  Page errors: ${errors.join('; ')}`);
      if (networkErrors.length) console.log(`  Network errors: ${networkErrors.join('; ')}`);
      if (badResponses.length) console.log(`  Bad responses: ${badResponses.join('; ')}`);

    } catch (err) {
      console.log(`  💥 ${test.name}: EXCEPTION — ${err.message}`);
      results.push({ name: test.name, status: 'exception', errors: [err.message] });
      try { await ss(page, `${test.name}-error`); } catch {}
    }

    await page.close();
    console.log('');
  }

  await browser.close();

  // ─── Summary ──────────────────────────────────────────
  console.log(`${'═'.repeat(50)}`);
  console.log('RESULTS');
  console.log(`${'═'.repeat(50)}`);
  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}: ${r.status}`);
    if (r.errors?.length) r.errors.forEach(e => console.log(`     → ${e}`));
    if (r.pageErrors?.length) r.errors?.push(...r.pageErrors);
    if (r.networkErrors?.length) r.networkErrors.forEach(e => console.log(`     🌐 ${e}`));
    if (r.badResponses?.length) r.badResponses.forEach(e => console.log(`     📡 ${e}`));
  }
  const passed = results.filter(r => r.status === 'success').length;
  console.log(`\n${passed}/${results.length} passed`);
})();
