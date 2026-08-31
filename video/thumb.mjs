import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage()
await p.addInitScript(() => { Object.defineProperty(document, 'modelContext', { value: { registerTool(t, o) { (window.__t ??= new Map()).set(t.name, t); o?.signal?.addEventListener('abort', () => window.__t.delete(t.name)) } }, configurable: true }); window.__webmcp = { call: async (n, i = {}) => await window.__t.get(n).execute(i, {}) } })
await p.goto('https://duet-ten.vercel.app', { waitUntil: 'networkidle' })
await p.evaluate(() => sessionStorage.clear()); await p.reload({ waitUntil: 'networkidle' })
await new Promise(r => setTimeout(r, 1200))
await p.evaluate(async () => { await window.__webmcp.call('load_template', { template: 'gala' }); await window.__webmcp.call('auto_arrange', {}) })
await new Promise(r => setTimeout(r, 800))
// chrome'u gizle, panoyu sığdır
await p.evaluate(() => {
  document.querySelector('.topbar')?.remove()
  document.querySelector('.sidebar')?.remove()
  document.querySelector('.zoom-controls')?.remove()
  document.querySelector('.help-fab')?.remove()
  document.querySelector('.toast')?.remove()
  document.querySelector('.agent-cursor')?.remove()
  const board = document.querySelector('.board')
  const inner = document.querySelector('.board-inner')
  inner.style.transform = 'scale(0.62)'
  board.scrollLeft = 0; board.scrollTop = 90
})
await new Promise(r => setTimeout(r, 400))
await p.evaluate(() => {
  const o = document.createElement('div')
  o.innerHTML = `
    <div style="position:fixed;inset:0;z-index:9000;background:linear-gradient(100deg, rgba(16,11,6,0.94) 0%, rgba(16,11,6,0.82) 34%, rgba(16,11,6,0.12) 62%, rgba(16,11,6,0.2) 100%)"></div>
    <div style="position:fixed;z-index:9001;left:64px;top:50%;transform:translateY(-50%);max-width:600px">
      <div style="font-size:44px;color:#9184ec;text-shadow:0 0 40px rgba(122,108,230,.8);margin-bottom:6px">✳</div>
      <div style="font-family:'Fraunces',serif;font-weight:600;font-size:118px;line-height:1;color:#f0cf8d;letter-spacing:1px">Duet</div>
      <div style="font-family:'Fraunces',serif;font-style:italic;font-size:34px;color:#f0e6d2;margin-top:14px;line-height:1.25">Plan the room<br>with your agent.</div>
      <div style="display:inline-block;margin-top:26px;font-family:'Albert Sans',sans-serif;font-weight:700;font-size:19px;letter-spacing:3px;color:#241a0d;background:linear-gradient(165deg,#f0cf8d,#d3a24f);padding:10px 22px;border-radius:99px;box-shadow:0 6px 24px rgba(211,162,79,.5)">BUILT ON WEBMCP</div>
    </div>`
  document.body.appendChild(o)
})
await new Promise(r => setTimeout(r, 500))
await p.screenshot({ path: process.env.HOME + '/Downloads/duet-thumbnail.png' })
await b.close()
console.log('saved')
