import puppeteer from 'puppeteer';

// ─── CONFIG — isi password asli sebelum run ───────────────────────────────────
const EMAIL    = 'anas.fikri@pcpexpress.co.id';
const PASSWORD = process.env.SOGO_PASS || 'FILL_PASSWORD_HERE';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const requests = [];
  page.on('console', msg => {
    const t = msg.text();
    if (!t.includes('React DevTools') && !t.includes('Future Flag')) {
      console.log('LOG:', t);
    }
  });
  page.on('response', async resp => {
    const url = resp.url();
    if (!url.includes('/SOGo/') || url.includes('WebServerResources') || url.includes('.css') || url.includes('.js')) return;
    const ct  = resp.headers()['content-type'] || '';
    const sc  = resp.headers()['set-cookie'] || '';
    console.log(`RESP [${resp.status()}] ${ct.split(';')[0]} — ${url.replace('http://localhost:5173', '')}`);
    if (sc) console.log(`  SET-COOKIE: ${sc.slice(0,120)}`);
  });

  // Step 1: Navigate to login
  console.log('\n=== Step 1: Navigate to /login ===');
  await page.goto('http://localhost:5173/webmail/login', { waitUntil: 'networkidle2' });

  // Step 2: Fill form
  console.log('=== Step 2: Fill login form ===');
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', PASSWORD);

  // Step 3: Submit
  console.log('=== Step 3: Submit ===');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  await new Promise(r => setTimeout(r, 3000));

  // Step 4: Result
  console.log('\n=== Step 4: Result ===');
  console.log('URL:', page.url());
  const cookies = await page.cookies();
  console.log('Cookies:', cookies.map(c => `${c.name}=${c.value.slice(0,20)}... (domain=${c.domain}, path=${c.path})`).join('\n  '));

  // Step 5: Check if mail page loaded
  if (page.url().includes('/mail')) {
    console.log('\n✅ Login SUCCESS! Waiting for folders...');
    await new Promise(r => setTimeout(r, 5000));
    const hasFolders = await page.evaluate(() => {
      return document.querySelectorAll('[data-folder]').length > 0 ||
             document.body.innerText.includes('Kotak Masuk');
    });
    console.log('Folders visible:', hasFolders);
  } else {
    console.log('\n❌ Login FAILED or session issue');
    const errorMsg = await page.evaluate(() => {
      const el = document.querySelector('[class*="destructive"]');
      return el ? el.innerText : null;
    });
    if (errorMsg) console.log('Error message:', errorMsg);
  }

  await browser.close();
})();
