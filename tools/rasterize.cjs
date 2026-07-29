// Dev-only tool: rasterize the hand-crafted SVGs into PNG game assets.
// Uses the pre-installed Chromium via Playwright. Not required to run the game.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const jobs = [
  { svg: 'svg/creature.svg', out: '../assets/creature.png', w: 640, h: 720, transparent: true },
  { svg: 'svg/room.svg',     out: '../assets/room.png',     w: 1600, h: 900, transparent: false },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  });
  for (const j of jobs) {
    const svg = fs.readFileSync(path.join(__dirname, j.svg), 'utf8');
    const page = await browser.newPage({
      viewport: { width: j.w, height: j.h },
      deviceScaleFactor: 2,
    });
    const html = `<!doctype html><html><head><style>
      html,body{margin:0;padding:0}${j.transparent ? 'html,body{background:transparent}' : ''}
      svg{display:block}</style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    const el = await page.$('svg');
    await el.screenshot({ path: path.join(__dirname, j.out), omitBackground: j.transparent });
    await page.close();
    console.log('wrote', j.out);
  }
  await browser.close();
})();
