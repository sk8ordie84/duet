// Six clean screen-recorded clips of the real DUET app for the Higgsfield edit.
// Each clip records its own browser session; marks.json carries trim points.
//   node video/clips.mjs

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const URL = 'https://duet-ten.vercel.app'
const RAW = new globalThis.URL('./clips-raw', import.meta.url).pathname
mkdirSync(RAW, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const allMarks = {}

async function openSession(name) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW + '/' + name, size: { width: 1920, height: 1080 } },
  })
  await ctx.addInitScript(() => {
    const tools = new Map()
    const notify = () => window.__onTools?.([...tools.keys()])
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool(tool, options) {
          tools.set(tool.name, tool)
          options?.signal?.addEventListener('abort', () => { tools.delete(tool.name); notify() })
          notify()
        },
      },
      configurable: true,
    })
    window.__webmcp = {
      list: () => [...tools.keys()],
      call: async (n, i = {}) => { const t = tools.get(n); if (!t) throw new Error('no tool ' + n); return await t.execute(i, {}) },
    }
  })
  const page = await ctx.newPage()
  const t0 = Date.now()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => sessionStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(900)
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      #vcur { position: fixed; z-index: 9999; width: 26px; height: 26px; border-radius: 50%;
        border: 2.5px solid #f0cf8d; background: rgba(240,207,141,0.18);
        box-shadow: 0 0 14px rgba(211,162,79,0.55); pointer-events: none;
        transform: translate(-50%,-50%); transition: width .12s, height .12s; opacity: 0; }
      #vcur.on { opacity: 1; }
      #vcur.down { width: 18px; height: 18px; background: rgba(240,207,141,0.4); }
      #toolpanel { position: fixed; right: 26px; top: 90px; z-index: 9998; width: 320px;
        background: rgba(26,18,10,0.94); border: 1px solid rgba(145,132,236,0.45);
        border-radius: 14px; padding: 14px 16px; backdrop-filter: blur(8px);
        box-shadow: 0 16px 50px rgba(0,0,0,.6); display: none;
        font-family: 'Spline Sans Mono', monospace; }
      #toolpanel h4 { margin: 0 0 9px; font-family: 'Albert Sans', sans-serif; font-size: 10.5px;
        letter-spacing: 2px; color: #beb3ff; font-weight: 700; }
      #toolpanel .cnt { color: #a5906f; font-size: 9.5px; margin-bottom: 7px; }
      #toolpanel ul { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow: hidden; }
      #toolpanel li { font-size: 10.5px; color: #d8cbb2; padding: 2.5px 0; border-bottom: 1px solid rgba(240,220,180,.06); }
      #toolpanel li.dyn { color: #f0cf8d; font-weight: 600; animation: tp-in .4s ease; }
      @keyframes tp-in { from { opacity: 0; transform: translateX(14px); } }
      #docpanel { position: fixed; right: 60px; top: 50%; transform: translateY(-50%) translateX(30px); z-index: 9998;
        width: 460px; max-height: 74vh; overflow: hidden;
        background: #fdf7e9; color: #33281c; border-radius: 14px; padding: 22px 26px;
        box-shadow: 0 30px 80px rgba(0,0,0,.65); opacity: 0; transition: opacity .5s ease, transform .5s ease;
        font-family: 'Spline Sans Mono', monospace; font-size: 11.5px; line-height: 1.65; white-space: pre-wrap; }
      #docpanel.show { opacity: 1; transform: translateY(-50%) translateX(0); }
      #docpanel h5 { font-family: 'Fraunces', serif; font-size: 17px; margin: 0 0 10px; }
    `
    document.head.appendChild(style)
    const cur = document.createElement('div'); cur.id = 'vcur'; document.body.appendChild(cur)
    const tp = document.createElement('div'); tp.id = 'toolpanel'
    tp.innerHTML = '<h4>WEBMCP TOOL REGISTRY</h4><div class="cnt"></div><ul></ul>'
    document.body.appendChild(tp)
    const dp = document.createElement('div'); dp.id = 'docpanel'; document.body.appendChild(dp)
    let base = null
    window.__stage = {
      cursor(x, y) { cur.classList.add('on'); cur.style.left = x + 'px'; cur.style.top = y + 'px' },
      press(d) { cur.classList.toggle('down', d) },
      showTools(v) { tp.style.display = v ? 'block' : 'none'; if (v) window.__onTools?.(window.__webmcp.list()) },
      doc(html) { if (!html) { dp.classList.remove('show'); return } dp.innerHTML = html; dp.classList.add('show') },
    }
    window.__onTools = (names) => {
      if (base === null) base = new Set(names)
      const ul = tp.querySelector('ul')
      const cnt = tp.querySelector('.cnt')
      cnt.textContent = names.length + ' tools registered · document.modelContext'
      ul.innerHTML = names.map((n) => `<li class="${base.has(n) ? '' : 'dyn'}">${n}</li>`).join('')
    }
  })
  const S = {
    page, ctx, t0,
    curX: 960, curY: 540,
    mark: {},
    async glide(x, y, ms = 650) {
      const steps = Math.max(8, Math.round(ms / 28))
      for (let i = 1; i <= steps; i++) {
        const p = i / steps, e = 1 - Math.pow(1 - p, 3)
        const nx = S.curX + (x - S.curX) * e, ny = S.curY + (y - S.curY) * e
        await page.evaluate(([a, b]) => window.__stage.cursor(a, b), [nx, ny])
        await page.mouse.move(nx, ny)
        await sleep(ms / steps)
      }
      S.curX = x; S.curY = y
    },
    async clickAt(x, y) {
      await S.glide(x, y)
      await page.evaluate(() => window.__stage.press(true))
      await page.mouse.click(x, y)
      await sleep(140)
      await page.evaluate(() => window.__stage.press(false))
    },
    async center(sel, txt) {
      return await page.evaluate(([s, t]) => {
        const first = (e) => ((e.getAttribute('title') || e.textContent || '').split('\n')[0] + ' ' + (e.textContent || ''))
        const els = [...document.querySelectorAll(s)]
        const el = t ? els.find((e) => first(e).includes(t)) : els[0]
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }, [sel, txt ?? null])
    },
    async dragGuest(srcSel, srcTxt, tableLabel, ms = 950) {
      const from = await S.center(srcSel, srcTxt)
      const to = await S.center('.table .table-label', tableLabel)
      if (!from || !to) throw new Error('drag: ' + srcTxt + ' → ' + tableLabel)
      await S.glide(from.x, from.y, 480)
      await page.evaluate(() => window.__stage.press(true))
      await sleep(120)
      await S.glide(to.x, to.y, ms)
      await S.dropNow(srcSel, srcTxt, tableLabel)
      await sleep(140)
      await page.evaluate(() => window.__stage.press(false))
    },
    async dropNow(srcSel, srcTxt, tableLabel) {
      await page.evaluate(([sSel, sTxt, tLabel]) => {
        const first = (e) => ((e.getAttribute('title') || e.textContent || '').split('\n')[0] + ' ' + (e.textContent || ''))
        const src = [...document.querySelectorAll(sSel)].find((e) => first(e).includes(sTxt))
        const label = [...document.querySelectorAll('.table .table-label')].find((e) => e.textContent === tLabel)
        const tgt = label.closest('.table')
        const dt = new DataTransfer()
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
        tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
        tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
      }, [srcSel, srcTxt, tableLabel])
    },
    agent: (n, i) => page.evaluate(([a, b]) => window.__webmcp.call(a, b), [n, i ?? {}]),
    now: () => +(((Date.now() - t0) / 1000)).toFixed(2),
  }
  return S
}

async function closeSession(S, name) {
  allMarks[name] = S.mark
  await S.ctx.close()
}

// ---------------- 01: gala load ----------------
{
  const S = await openSession('01-gala-load')
  await sleep(600)
  S.mark.start = S.now()
  const card = await S.center('.template-card', 'Fundraising gala')
  await S.glide(card.x, card.y, 900)
  await S.clickAt(card.x, card.y)
  await sleep(3600)
  S.mark.end = S.now()
  await closeSession(S, '01-gala-load')
  console.log('01 done')
}

// ---------------- 02: human pins ----------------
{
  const S = await openSession('02-human-pins')
  await S.agent('load_template', { template: 'gala' })
  await sleep(1400)
  S.mark.start = S.now()
  await S.dragGuest('.chip', 'Katja Ilic', 'Table 1', 1100)
  await sleep(1300)
  await S.dragGuest('.chip', 'Ada Okafor', 'Table 1', 1100)
  await sleep(2600)
  S.mark.end = S.now()
  await closeSession(S, '02-human-pins')
  console.log('02 done')
}

// ---------------- 03: agent + solver + proposal + accept ----------------
{
  const S = await openSession('03-agent-solver')
  await S.agent('load_template', { template: 'gala' })
  await sleep(1200)
  await S.dropNow('.chip', 'Katja Ilic', 'Table 1')
  await S.dropNow('.chip', 'Ada Okafor', 'Table 1')
  await sleep(900)
  S.mark.start = S.now()
  await S.agent('add_constraint', { kind: 'apart', guest_a: 'Wale Costa', guest_b: 'Ada Okafor', note: 'no interviews at dinner' })
  await sleep(2400)
  await S.agent('set_group_rule', { group: 'corporate partners', mode: 'spread', max_per_table: 2 })
  await sleep(2400)
  await S.agent('propose_arrangement', { note: 'Donors seated with their hosts, press kept away from the board, partners mixed — your two pins untouched.' })
  await sleep(3000)
  const review = await S.center('.proposal .btn', 'Review')
  await S.clickAt(review.x, review.y)
  await sleep(3000)
  const accept = await S.center('.proposal .btn.primary')
  await S.clickAt(accept.x, accept.y)
  await sleep(4200)
  S.mark.end = S.now()
  await closeSession(S, '03-agent-solver')
  console.log('03 done')
}

// ---------------- 04: conflict + notes ----------------
{
  const S = await openSession('04-conflict-explain')
  await S.agent('load_template', { template: 'gala' })
  await sleep(1000)
  await S.agent('add_constraint', { kind: 'apart', guest_a: 'Wale Costa', guest_b: 'Ada Okafor', note: 'no interviews at dinner' })
  await S.agent('auto_arrange', {})
  await sleep(1600)
  const plan = JSON.parse(await S.agent('get_seating_plan', {}))
  const ada = plan.guests.find((g) => g.name === 'Ada Okafor')
  S.mark.start = S.now()
  await S.dragGuest('.seat.filled', 'Wale Costa', ada.table, 900)
  await sleep(2600)
  const tag = await S.center('.conflict-tag')
  if (tag) { await S.glide(tag.x, tag.y, 700); await S.page.mouse.move(tag.x, tag.y); await sleep(4200) }
  S.mark.end = S.now()
  await closeSession(S, '04-conflict-explain')
  console.log('04 done')
}

// ---------------- 05: dynamic tool registry ----------------
{
  const S = await openSession('05-dynamic-tools')
  await S.agent('load_template', { template: 'gala' })
  await S.agent('auto_arrange', {})
  await sleep(1400)
  await S.page.evaluate(() => window.__stage.showTools(true))
  await sleep(600)
  S.mark.start = S.now()
  await sleep(2000)
  const t6 = await S.center('.table .table-label', 'Table 6')
  await S.clickAt(t6.x, t6.y)
  await sleep(3600)
  await S.clickAt(t6.x, t6.y - 300 > 60 ? t6.x : t6.x, 700) // click empty board area below
  await S.page.evaluate(() => document.querySelector('.board').dispatchEvent(new MouseEvent('click', { bubbles: false })))
  await S.page.evaluate(() => {
    // deselect via a real click on empty board space
    const b = document.querySelector('.board')
    const ev = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(ev, 'target', { value: b })
    b.dispatchEvent(ev)
  })
  await sleep(3000)
  S.mark.end = S.now()
  await closeSession(S, '05-dynamic-tools')
  console.log('05 done')
}

// ---------------- 06: caterer brief ----------------
{
  const S = await openSession('06-caterer')
  await S.agent('load_template', { template: 'gala' })
  await S.agent('auto_arrange', {})
  await sleep(1400)
  const md = await S.agent('export_plan', {})
  const brief = md.split('## Catering brief')[1] || ''
  const tables = md.split('\n').filter((l) => l.startsWith('## Table')).slice(0, 4).join('\n')
  S.mark.start = S.now()
  await sleep(1200)
  await S.page.evaluate(([b]) => {
    window.__stage.doc(`<h5>Caterer's brief</h5>CATERING${b}\n\n(generated live by export_plan from the seated room)`)
  }, [brief])
  await sleep(6200)
  S.mark.end = S.now()
  await closeSession(S, '06-caterer')
  console.log('06 done')
}

await browser.close()
writeFileSync(new globalThis.URL('./clips-marks.json', import.meta.url), JSON.stringify(allMarks, null, 2))
console.log('MARKS', JSON.stringify(allMarks))
