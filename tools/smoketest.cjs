// Dev-only: charge le jeu dans Chromium, capture les erreurs console et un screenshot.
const { chromium } = require('playwright');
(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    args: [
      '--ignore-certificate-errors',            // test uniquement (proxy CA)
      
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [], logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' :: ' + (r.failure()?.errorText)));

  const resp = await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'load', timeout: 30000 });
  console.log('HTTP status=', resp && resp.status());
  await page.waitForTimeout(5000); // laisse charger three + textures + qq frames

  // état visible ?
  const loaderHidden = await page.evaluate(() => { const l = document.getElementById('loader'); return l ? l.classList.contains('hidden') : 'NO-LOADER'; });
  const pct = await page.evaluate(() => { const g = document.getElementById('gauge-pct'); return g ? g.textContent : 'NO-GAUGE'; });
  await page.screenshot({ path: __dirname + '/../scratch-idle.png' });

  // --- exerce les interactions : caresses sur la créature + boutons ---------
  const cx = 640, cy = 500;
  for (let i = 0; i < 8; i++) { await page.mouse.click(cx + (i % 3) * 8, cy); await page.waitForTimeout(60); }
  await page.click('#btn-hug').catch(() => {});
  await page.click('#btn-compliment').catch(() => {});
  await page.waitForTimeout(300);
  const pct2 = await page.evaluate(() => document.getElementById('gauge-pct').textContent);
  const visibleHearts = await page.evaluate(() => window.__debugHearts ? window.__debugHearts() : 'n/a');
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/../scratch-active.png' });

  console.log('loaderHidden=', loaderHidden, ' gaugePct=', pct, '→ afterActions=', pct2, ' heartsAlive=', visibleHearts);
  console.log('--- console ---'); logs.slice(-25).forEach(l => console.log(l));
  console.log('--- errors ---'); errors.forEach(e => console.log(e));
  await browser.close();
})();
