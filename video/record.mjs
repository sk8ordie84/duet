// Duet demo film — single-take 1080p recording of the live product.
// Drives https://duet-ten.vercel.app with a scripted story; captions, a fake
// cursor, and intro/outro cards are injected in-page so no editor is needed.
//
//   node video/record.mjs

import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = 'https://duet-ten.vercel.app'
const OUT = new globalThis.URL('./raw', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
})
// The recording harness IS the agent host: provide document.modelContext before
// the app boots, so tools register against it and the badge reads "Agent connected".
await ctx.addInitScript(() => {
  const tools = new Map()
  Object.defineProperty(document, 'modelContext', {
    value: {
      registerTool(tool, options) {
        tools.set(tool.name, tool)
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
      },
    },
    configurable: true,
  })
  window.__webmcp = {
    list: () => [...tools.keys()],
    call: async (name, input = {}) => {
      const t = tools.get(name)
      if (!t) throw new Error('no tool ' + name)
      return await t.execute(input, {})
    },
  }
})

const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.evaluate(() => sessionStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await sleep(800)

// ---------- injected stage helpers (cursor, captions, cards) ----------

await page.evaluate(() => {
  const style = document.createElement('style')
  style.textContent = `
    #vcur {
      position: fixed; z-index: 9999; width: 26px; height: 26px; border-radius: 50%;
      border: 2.5px solid #f0cf8d; background: rgba(240,207,141,0.18);
      box-shadow: 0 0 14px rgba(211,162,79,0.55), inset 0 0 6px rgba(240,207,141,0.4);
      pointer-events: none; transform: translate(-50%, -50%);
      transition: width .12s, height .12s;
    }
    #vcur.down { width: 18px; height: 18px; background: rgba(240,207,141,0.4); }
    #vcap {
      position: fixed; z-index: 9998; left: 50%; bottom: 46px; transform: translateX(-50%);
      max-width: 900px; padding: 14px 30px; border-radius: 14px;
      background: rgba(18, 12, 6, 0.86); backdrop-filter: blur(8px);
      border: 1px solid rgba(240,220,180,0.16);
      font-family: 'Fraunces', Georgia, serif; font-style: italic;
      font-size: 25px; line-height: 1.35; color: #f0e6d2; text-align: center;
      opacity: 0; transition: opacity .45s ease; pointer-events: none;
      box-shadow: 0 18px 50px rgba(0,0,0,.55);
    }
    #vcap .k { color: #f0cf8d; font-style: normal; font-weight: 600; }
    #vcap .a { color: #beb3ff; font-style: normal; font-weight: 600; }
    #vcard {
      position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      background: radial-gradient(900px 600px at 50% 42%, #241a0f, #14100a 75%);
      opacity: 1; transition: opacity .8s ease; pointer-events: none;
    }
    #vcard.hidden { opacity: 0; }
    #vcard .mark { font-size: 54px; color: #9184ec; text-shadow: 0 0 34px rgba(122,108,230,.6); }
    #vcard h1 { font-family: 'Fraunces', serif; font-weight: 560; font-size: 74px; margin: 0; color: #f0cf8d; letter-spacing: 1px; }
    #vcard p  { font-family: 'Fraunces', serif; font-style: italic; font-size: 27px; margin: 0; color: #f0e6d2; }
    #vcard .sub { font-family: 'Albert Sans', sans-serif; font-style: normal; font-size: 16px; letter-spacing: 3px; text-transform: uppercase; color: #a5906f; margin-top: 18px; }
    #vcard .url { font-family: 'Spline Sans Mono', monospace; font-size: 20px; color: #beb3ff; margin-top: 6px; }
  `
  document.head.appendChild(style)
  const cur = document.createElement('div')
  cur.id = 'vcur'
  cur.style.left = '960px'
  cur.style.top = '540px'
  document.body.appendChild(cur)
  const cap = document.createElement('div')
  cap.id = 'vcap'
  document.body.appendChild(cap)
  window.__stage = {
    cursor(x, y) { cur.style.left = x + 'px'; cur.style.top = y + 'px' },
    press(d) { cur.classList.toggle('down', d) },
    caption(html) {
      if (!html) { cap.style.opacity = '0'; return }
      cap.innerHTML = html
      cap.style.opacity = '1'
    },
    card(html) {
      let el = document.getElementById('vcard')
      if (!html) { el?.classList.add('hidden'); setTimeout(() => el?.remove(), 900); return }
      if (!el) { el = document.createElement('div'); el.id = 'vcard'; document.body.appendChild(el) }
      el.classList.remove('hidden')
      el.innerHTML = html
    },
  }
})

const stage = {
  caption: (html) => page.evaluate((h) => window.__stage.caption(h), html),
  card: (html) => page.evaluate((h) => window.__stage.card(h), html),
  press: (d) => page.evaluate((v) => window.__stage.press(v), d),
}

let curX = 960, curY = 540
async function glide(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 28))
  for (let i = 1; i <= steps; i++) {
    const p = i / steps
    const e = 1 - Math.pow(1 - p, 3)
    const nx = curX + (x - curX) * e
    const ny = curY + (y - curY) * e
    await page.evaluate(([a, b]) => window.__stage.cursor(a, b), [nx, ny])
    await page.mouse.move(nx, ny)
    await sleep(ms / steps)
  }
  curX = x; curY = y
}

async function clickAt(x, y) {
  await glide(x, y)
  await stage.press(true)
  await page.mouse.click(x, y)
  await sleep(140)
  await stage.press(false)
}

async function center(selector, matchText) {
  return await page.evaluate(([sel, txt]) => {
    const els = [...document.querySelectorAll(sel)]
    const first = (e) => ((e.getAttribute('title') || e.textContent || '').split('\n')[0] + ' ' + (e.textContent || ''))
    const el = txt ? els.find((e) => first(e).includes(txt)) : els[0]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, [selector, matchText ?? null])
}

// Synthetic HTML5 drag (Playwright mouse can't drive native DnD) + cursor show.
async function dragGuest(sourceSel, sourceText, tableLabel, ms = 900) {
  const from = await center(sourceSel, sourceText)
  const to = await center('.table .table-label', tableLabel)
  if (!from || !to) throw new Error(`drag: missing ${sourceText} or ${tableLabel}`)
  await glide(from.x, from.y, 500)
  await stage.press(true)
  await sleep(120)
  await glide(to.x, to.y, ms)
  await page.evaluate(([sSel, sTxt, tLabel]) => {
    const src = [...document.querySelectorAll(sSel)].find((e) => (((e.getAttribute('title') || e.textContent || '').split('\n')[0]) + ' ' + (e.textContent || '')).includes(sTxt))
    const label = [...document.querySelectorAll('.table .table-label')].find((e) => e.textContent === tLabel)
    const tgt = label.closest('.table')
    const dt = new DataTransfer()
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    tgt.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
    tgt.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
  }, [sourceSel, sourceText, tableLabel])
  await sleep(150)
  await stage.press(false)
}

const agent = (name, input) => page.evaluate(([n, i]) => window.__webmcp.call(n, i), [name, input ?? {}])

// ============================ THE FILM ============================

// S0 — title card
await stage.card(`
  <div class="mark">✳</div>
  <h1>Duet</h1>
  <p>Plan the room with your agent.</p>
  <div class="sub">Built on WebMCP · OpenAI WebMCP Challenge</div>
`)
await sleep(4200)
await stage.card(null)
await sleep(1000)

// S1 — the problem + picker
await stage.caption(`Seating a room is a <span class="k">two-brain problem</span> — taste and politics on one side, a pile of constraints on the other.`)
await sleep(3600)
const galaCard = await center('.template-card', 'Fundraising gala')
await stage.caption(`Tonight: a fundraising gala. <span class="k">120 guests, 16 tables</span> — feuds, diets, donors, press.`)
await clickAt(galaCard.x, galaCard.y)
await sleep(2600)
await stage.caption(null)
await sleep(400)

// S2 — human makes calls (drag two guests → pinned)
await stage.caption(`<span class="k">You make the calls.</span> Drag anyone — your placements are pinned&nbsp;📌. Law, as far as the agent is concerned.`)
await dragGuest('.chip', 'Katja Ilic', 'Table 1')
await sleep(700)
await dragGuest('.chip', 'Ada Okafor', 'Table 1')
await sleep(1600)
await stage.caption(null)
await sleep(400)

// S3 — agent works the board
await stage.caption(`<span class="a">Your agent works the same board</span> — through 22 real WebMCP tools, not screenshots.`)
await agent('add_constraint', { kind: 'apart', guest_a: 'Wale Costa', guest_b: 'Ada Okafor', note: 'no interviews at dinner' })
await sleep(2300)
await agent('set_group_rule', { group: 'corporate partners', mode: 'spread', max_per_table: 2 })
await sleep(2300)
await stage.caption(`It records the feuds, sets the mixing rules… and <span class="a">never surprises you</span>: it proposes.`)
await agent('propose_arrangement', { note: 'Donors seated with their hosts, press kept away from the board, partners mixed — your two pins untouched.' })
await sleep(3400)
await stage.caption(null)
await sleep(300)

// S4 — review & accept
const review = await center('.proposal .btn', 'Review')
await clickAt(review.x, review.y)
await sleep(2600)
await stage.caption(`<span class="k">You stay in charge.</span> Review the moves — then one click.`)
const accept = await center('.proposal .btn.primary')
await clickAt(accept.x, accept.y)
await sleep(1200)
await stage.caption(`118 moves. Every feud honored, every diet counted — and your pins <span class="k">exactly where you left them</span>.`)
await sleep(3600)
await stage.caption(null)
await sleep(400)

// S5 — break something → the room reacts
await stage.caption(`Break something on purpose — <span class="k">the room reacts</span>, and the notes tell you who feuds and why.`)
await dragGuest('.seat.filled', 'Wale Costa', 'Table 1', 800)
await sleep(2400)
const tag = await center('.conflict-tag')
if (tag) { await glide(tag.x, tag.y, 600); await page.mouse.move(tag.x, tag.y); await sleep(3000) }
await stage.caption(null)
await sleep(300)

// S6 — ask the agent to fix it + explainability
await stage.caption(`Ask your agent to fix it — or ask <span class="a">“why is she seated there?”</span> The solver explains itself.`)
await agent('propose_arrangement', { note: 'Two moves to separate Wale and Ada again — nothing else changes.', respect_current: false })
await sleep(2800)
const accept2 = await center('.proposal .btn.primary')
if (accept2) await clickAt(accept2.x, accept2.y)
await sleep(2200)
await stage.caption(null)
await sleep(300)

// S7 — montage: same engine, other rooms
await stage.caption(`Weddings. Offices. Classrooms. Corporate dinners. <span class="k">Same engine</span> — people, places, and the politics between them.`)
for (const t of ['wedding', 'office', 'classroom']) {
  await agent('load_template', { template: t })
  await sleep(500)
  await agent('auto_arrange', {})
  await sleep(2100)
}
await stage.caption(null)
await sleep(400)

// S8 — outro card
await stage.card(`
  <div class="mark">✳</div>
  <h1>Duet</h1>
  <p>Humans keep the judgment. Agents do the labor.</p>
  <div class="url">duet-ten.vercel.app</div>
  <div class="url">github.com/sk8ordie84/duet</div>
  <div class="sub">Built on WebMCP</div>
`)
await sleep(5200)

await ctx.close()
await browser.close()
console.log('DONE — raw webm in video/raw/')
