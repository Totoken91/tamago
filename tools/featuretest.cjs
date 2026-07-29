const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const p = await b.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:2, hasTouch:true });
  // force l'après-midi (14h) pour tester le mini-jeu (pas de sommeil)
  await p.addInitScript(() => { const R=Date.prototype.getHours; Date.prototype.getHours=function(){return 14;}; });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'load'});
  await p.waitForTimeout(1600);

  const boot = await p.evaluate(()=>({
    bond: document.getElementById('bond-lvl').textContent,
    days: document.getElementById('days').textContent,
    sound: document.getElementById('btn-sound').textContent,
    daynightBg: getComputedStyle(document.getElementById('daynight')).backgroundColor,
    zzz: document.getElementById('zzz').className,
  }));
  console.log('boot:', JSON.stringify(boot));

  // sound toggle
  await p.click('#btn-sound');
  const sound2 = await p.evaluate(()=>document.getElementById('btn-sound').textContent);

  // mini-jeu
  await p.click('#btn-play');
  await p.waitForTimeout(1400);
  const playing = await p.evaluate(()=>document.getElementById('minigame').classList.contains('playing'));
  const nHearts = await p.evaluate(()=>document.querySelectorAll('.fall-heart').length);
  // tape un cœur
  let scored = 0;
  const box = await p.evaluate(()=>{const h=document.querySelector('.fall-heart'); if(!h)return null; const r=h.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
  if (box) { await p.mouse.click(box.x, box.y); await p.waitForTimeout(150);
    scored = await p.evaluate(()=>{const s=document.querySelector('.mg-score'); return s?+s.textContent:-1;}); }
  await p.screenshot({path:'scratch-feature.png'});

  console.log(`sound ${boot.sound}->${sound2}  playing=${playing}  fallHearts=${nHearts}  scoreAfterTap=${scored}`);
  console.log('errors:', errs.length?errs:'none');
  await b.close();
})();
