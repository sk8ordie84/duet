// Typographic cards & overlays for the film — brand fonts, rendered to PNG.
//   node video/cards.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = new globalThis.URL('./cards', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage()

const BASE = `
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Albert+Sans:wght@300..800&family=Spline+Sans+Mono:wght@400..600&display=swap" rel="stylesheet">
<style>
  * { margin:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; font-family:'Albert Sans',sans-serif; }
  .dark { background: radial-gradient(1000px 640px at 50% 44%, #241a0f, #14100a 78%); }
  .clear { background: transparent; }
  .center { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; }
  .kicker { font-size:19px; letter-spacing:6px; color:#a5906f; font-weight:700; }
  h1 { font-family:'Fraunces',serif; font-weight:560; font-size:150px; color:#f0cf8d; letter-spacing:1px; }
  .tag { font-family:'Fraunces',serif; font-style:italic; font-size:42px; color:#f0e6d2; line-height:1.4; }
  .mark { font-size:56px; color:#9184ec; text-shadow:0 0 44px rgba(122,108,230,.7); }
  .lower { position:absolute; left:0; right:0; bottom:84px; display:flex; justify-content:center; }
  .pill { background:rgba(16,11,6,.88); border:1px solid rgba(240,220,180,.2); border-radius:16px;
          padding:26px 54px; font-weight:800; font-size:46px; letter-spacing:5px; color:#f0e6d2;
          box-shadow:0 20px 60px rgba(0,0,0,.55); }
  .pill .g { color:#f0cf8d; } .pill .v { color:#beb3ff; }
  .big { font-weight:800; font-size:92px; letter-spacing:4px; color:#f0e6d2; line-height:1.22;
         text-shadow:0 4px 30px rgba(0,0,0,.8); }
  .statcard { background:rgba(20,14,8,.93); border:1px solid rgba(240,220,180,.18); border-radius:22px;
              padding:64px 84px; display:flex; flex-direction:column; gap:26px; box-shadow:0 30px 90px rgba(0,0,0,.6); }
  .stat { font-family:'Spline Sans Mono',monospace; font-size:36px; color:#d8cbb2; letter-spacing:1px; }
  .stat b { color:#f0cf8d; font-weight:600; }
</style>`

const CARDS = {
  't0-title': { bg: 'dark', html: `
    <div class="center" style="gap:26px">
      <div class="mark">✳</div>
      <h1>DUET</h1>
      <div class="tag">Human judgment. Agent computation.<br>One shared surface.</div>
    </div>` },
  'o1a': { bg: 'clear', html: `<div class="lower"><div class="pill">HUMAN DECISIONS BECOME <span class="g">CONSTRAINTS</span></div></div>` },
  'o1b': { bg: 'clear', html: `<div class="lower"><div class="pill"><span class="g">PINS ARE LAW</span></div></div>` },
  'o2a': { bg: 'clear', html: `<div class="lower"><div class="pill"><span class="v">118 MOVES</span> · 0 HUMAN PINS TOUCHED</div></div>` },
  'o2b': { bg: 'clear', html: `<div class="lower"><div class="pill"><span class="v">AGENTS PROPOSE.</span> <span class="g">HUMANS DECIDE.</span></div></div>` },
  'o3':  { bg: 'clear', html: `<div class="lower"><div class="pill">VISIBLE · EXPLAINABLE · <span class="g">REVERSIBLE</span></div></div>` },
  'o4':  { bg: 'clear', html: `
    <div class="center" style="justify-content:flex-end; padding-bottom:110px">
      <div class="big">THE TOOL SURFACE<br><span style="color:#beb3ff">FOLLOWS HUMAN ATTENTION</span></div>
    </div>` },
  'o6':  { bg: 'clear', html: `
    <div class="center">
      <div class="statcard">
        <div class="stat"><b>21</b> BASE WEBMCP TOOLS</div>
        <div class="stat"><b>4</b> DYNAMIC SELECTION-SCOPED TOOLS</div>
        <div class="stat">STRUCTURED <b>JSON</b> RESULTS</div>
        <div class="stat">PIN GUARDRAILS AT THE <b>TOOL LAYER</b></div>
        <div class="stat">DEPENDENCY-FREE <b>CONSTRAINT SOLVER</b></div>
        <div class="stat"><b>~75 MS</b> / 120 GUESTS</div>
      </div>
    </div>` },
  't8-close': { bg: 'dark', html: `
    <div class="center" style="gap:26px">
      <div class="mark">✳</div>
      <h1>DUET</h1>
      <div class="kicker">BUILT FOR THE WEBMCP CHALLENGE</div>
      <div class="tag" style="font-size:30px; font-family:'Spline Sans Mono',monospace; font-style:normal; color:#beb3ff">duet-ten.vercel.app</div>
    </div>` },
}

for (const [name, c] of Object.entries(CARDS)) {
  await page.setContent(`<!doctype html><html><head>${BASE}</head><body class="${c.bg}" style="position:relative">${c.html}</body></html>`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 300))
  await page.screenshot({ path: `${OUT}/${name}.png`, omitBackground: c.bg === 'clear' })
  console.log(name)
}
await browser.close()
