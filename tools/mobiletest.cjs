const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  async function run(name, w, h) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://127.0.0.1:5173/index.html',{waitUntil:'load'});
    await p.waitForTimeout(3500);
    const before = await p.evaluate(()=>document.getElementById('gauge-pct').textContent);
    // tap-caresse au centre (créature) via touch
    for(let i=0;i<6;i++){ await p.touchscreen.tap(w/2, h*0.55); await p.waitForTimeout(70); }
    await p.tap('#btn-hug').catch(()=>{});
    await p.tap('#btn-compliment').catch(()=>{});
    await p.waitForTimeout(400);
    const after = await p.evaluate(()=>document.getElementById('gauge-pct').textContent);
    // les boutons débordent-ils de l'écran ?
    const overflow = await p.evaluate(()=>{const r=document.getElementById('actions').getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),bottom:Math.round(r.bottom),vw:innerWidth,vh:innerHeight};});
    await p.screenshot({path:`scratch-${name}.png`});
    console.log(`[${name} ${w}x${h}] love ${before}→${after}  actionsRect=${JSON.stringify(overflow)}  errors=${errs.length?errs:'none'}`);
    await ctx.close();
  }
  await run('portrait', 390, 844);
  await run('landscape', 844, 390);
  await run('small', 360, 640);
  await b.close();
})();
