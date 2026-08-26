const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const raw = execSync(`curl -s http://localhost:34600/users/login -H "Content-Type: application/json" -d '{"username":"admin","password":"123456"}'`).toString();
  const data = JSON.parse(raw);
  const token = data.token.replace(/^Bearer\s+/i, '');
  const schoolId = data.school_id;

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pages = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Teacher Lessons', path: '/teacher/lessons' },
    { name: 'Teacher Approvals', path: '/teacher/approvals' },
    { name: 'Game Creator', path: '/teacher/create-game' },
    { name: 'Asset Library', path: '/admin/assets' },
    { name: 'Student Home', path: '/student' },
  ];

  const mobile = { width: 390, height: 844 };
  const issues = [];

  for (const pg of pages) {
    const page = await browser.newPage();
    await page.setViewport(mobile);
    await page.goto('http://localhost:34601', { waitUntil: 'networkidle2', timeout: 10000 });
    await page.evaluate((tok, sid) => {
      localStorage.setItem('@@auth_token', tok);
      localStorage.setItem('school_id', sid);
      localStorage.setItem('user_data', JSON.stringify({ user_type: 'Admin' }));
    }, token, schoolId);

    await page.goto(`http://localhost:34601${pg.path}`, { waitUntil: 'networkidle2', timeout: 12000 });
    await sleep(2000);

    const audit = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewWidth = window.innerWidth;
      const horizontalOverflow = docWidth > viewWidth + 2;

      // Find elements that overflow
      const overflowingEls = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewWidth + 5 || rect.left < -5) {
          const tag = el.tagName;
          const cls = el.className?.toString().slice(0, 60) || '';
          const txt = el.textContent?.trim().slice(0, 40) || '';
          overflowingEls.push({ tag, cls, txt, right: Math.round(rect.right), left: Math.round(rect.left) });
        }
      }

      // Find touch targets < 44px
      const smallTargets = [];
      const interactives = document.querySelectorAll('button, a, input, select, [role="button"]');
      for (const el of interactives) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          const txt = el.textContent?.trim().slice(0, 30) || el.placeholder || el.getAttribute('aria-label') || '';
          smallTargets.push({
            tag: el.tagName,
            txt,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }

      return {
        docWidth,
        viewWidth,
        horizontalOverflow,
        overflowingCount: overflowingEls.length,
        overflowingTop3: overflowingEls.slice(0, 3),
        smallTargetsCount: smallTargets.length,
        smallTargetsTop5: smallTargets.slice(0, 5),
      };
    });

    console.log(`\n── ${pg.name} (${mobile.width}×${mobile.height}) ──`);
    console.log(`  Doc width: ${audit.docWidth} | View: ${audit.viewWidth} | Overflow: ${audit.horizontalOverflow ? 'YES ⚠️' : 'OK ✅'}`);
    if (audit.overflowingCount > 0) {
      console.log(`  Overflows: ${audit.overflowingCount} elements`);
      audit.overflowingTop3.forEach(o => console.log(`    <${o.tag}> "${o.txt}" right=${o.right}`));
      issues.push({ page: pg.name, type: 'overflow', count: audit.overflowingCount });
    }
    console.log(`  Small touch targets: ${audit.smallTargetsCount} ${audit.smallTargetsCount > 5 ? '⚠️' : '✅'}`);
    if (audit.smallTargetsCount > 0) {
      audit.smallTargetsTop5.forEach(t => console.log(`    <${t.tag}> "${t.txt}" ${t.w}×${t.h}px`));
      issues.push({ page: pg.name, type: 'small-targets', count: audit.smallTargetsCount });
    }

    await page.close();
  }

  // Also check the login page
  const loginPage = await browser.newPage();
  await loginPage.setViewport(mobile);
  await loginPage.goto('http://localhost:34601/login', { waitUntil: 'networkidle2', timeout: 15000 });
  await sleep(2000);
  const loginAudit = await loginPage.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    viewWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
  }));
  console.log(`\n── Login Page ──`);
  console.log(`  Doc width: ${loginAudit.docWidth} | View: ${loginAudit.viewWidth} | Overflow: ${loginAudit.overflow ? 'YES ⚠️' : 'OK ✅'}`);
  if (loginAudit.overflow) issues.push({ page: 'Login', type: 'overflow', count: 1 });
  await loginPage.close();

  await browser.close();

  console.log(`\n${'═'.repeat(50)}`);
  console.log('RESPONSIVENESS AUDIT SUMMARY');
  console.log(`${'═'.repeat(50)}`);
  if (issues.length === 0) {
    console.log('✅ No issues found!');
  } else {
    issues.forEach(i => console.log(`  ⚠️  ${i.page}: ${i.type} (${i.count} elements)`));
  }
})();
