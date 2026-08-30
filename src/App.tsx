import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getState,
  subscribe,
  update,
  undo,
  guestsAt,
  conflicts,
  vocab,
  animated,
  applyProposal,
  dismissProposal,
  uid,
  type Guest,
  type Table,
  type Diet,
} from './model'
import { registerBaseTools, syncSelectionTools, webmcpAvailable, exportMarkdown, computeArrangement } from './webmcp'
import { TEMPLATES, loadTemplate } from './templates'
import './App.css'

function useApp() {
  return useSyncExternalStore(subscribe, getState)
}

// tiny toast channel — any component can announce, App renders it
let announce: (msg: string) => void = () => {}

const DIET_ICON: Record<string, string> = {
  vegetarian: '🥬',
  vegan: '🌱',
  'gluten-free': '🌾',
  halal: '🕌',
  kosher: '✡️',
}

export default function App() {
  const s = useApp()
  const [mcp] = useState(() => webmcpAvailable())
  const [sideOpen, setSideOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    registerBaseTools()
    announce = (msg: string) => {
      setToast(msg)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 3200)
    }
    return () => {
      announce = () => {}
    }
  }, [])

  useEffect(() => {
    syncSelectionTools()
  }, [s.selection])

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn side-toggle" onClick={() => setSideOpen(!sideOpen)}>☰</button>
        <div className="brand">
          <span className="brand-mark">◐</span> Duet
        </div>
        <input
          className="event-name"
          value={s.event.name}
          onChange={(e) => update((st) => ({ ...st, event: { ...st.event, name: e.target.value } }), { undoable: false })}
        />
        <div className="topbar-right">
          <span className={`mcp-badge ${mcp ? 'on' : 'off'}`}>
            {mcp ? '● agent connected via WebMCP' : '○ WebMCP not available'}
          </span>
          <button className="btn" onClick={() => undo()}>↩ Undo</button>
          {s.guests.length > 0 && s.tables.length > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                const { seats, moves } = computeArrangement(false)
                if (moves === 0) {
                  announce('Already optimal — nothing to move.')
                  return
                }
                animated(() =>
                  update(
                    (st) => ({
                      ...st,
                      proposal: null,
                      guests: st.guests.map((g) => ({ ...g, tableId: seats.get(g.id) ?? null })),
                    }),
                    { actor: 'human', describe: `arranged the room (${moves} moves)` }
                  )
                )
                announce(`Arranged — ${moves} moves. Pinned ${'\u{1F4CC}'} stayed put.`)
              }}
            >
              ✨ Arrange
            </button>
          )}
          {s.guests.length > 0 && (
            <>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(exportMarkdown(getState())).then(
                    () => alert('Plan copied as markdown — paste it anywhere.'),
                    () => alert('Could not access the clipboard.')
                  )
                }}
              >
                ⇪ Export
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (confirm('Clear the whole plan?')) {
                    localStorage.removeItem('duet-plan-v1')
                    update(
                      (st) => ({ ...st, guests: [], tables: [], constraints: [], proposal: null, selection: null }),
                      { actor: 'human', describe: 'cleared the plan' }
                    )
                  }
                }}
              >
                Reset
              </button>
            </>
          )}
        </div>
      </header>

      <div className="main">
        <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
          <GuestPool />
          <ActivityFeed />
        </aside>
        <Board />
        <HelpButton mcp={mcp} />
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}

function HelpButton({ mcp }: { mcp: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="help-fab" onClick={() => setOpen(!open)} title="How to use Duet with your agent">
        {open ? '✕' : '?'}
      </button>
      {open && (
        <div className="help-panel">
          <h3>Plan this room with your agent</h3>
          <p className="help-status">
            {mcp
              ? 'Your agent is connected — this page exposes its tools via WebMCP.'
              : 'No WebMCP agent detected. Open this page in ChatGPT’s in-app browser, or enable chrome://flags/#enable-webmcp-testing.'}
          </p>
          <p>You drag guests and make the judgment calls. Your agent does the constraint labor. Try asking it:</p>
          <ul>
            <li>“Load the gala template and propose a seating plan.”</li>
            <li>“Add my guests: Ali (groom's family, vegan), Sara (college friends)…”</li>
            <li>“These two can't stand each other — keep them apart, then propose a fix.”</li>
            <li><em>Drag someone yourself</em> — they get pinned 📌 and the agent must work around your call.</li>
            <li><em>Select a table, then:</em> “Who's at this table? Fill the empty seats.”</li>
            <li>“Export the plan and draft an email to the caterer.”</li>
          </ul>
          <p className="help-foot">
            Every agent action shows up as the <span className="agent-ink">✳ violet cursor</span> and in the activity
            feed — and you can undo anything. <a href="https://github.com/sk8ordie84/duet" target="_blank" rel="noreferrer">Source ↗</a>
          </p>
        </div>
      )}
    </>
  )
}

// ---------------- Guest pool ----------------

function GuestPool() {
  const s = useApp()
  const v = vocab(s)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState(false)

  const unseated = s.guests.filter((g) => g.tableId == null).length
  const q = query.trim().toLowerCase()
  const visible = q ? s.guests.filter((g) => g.name.toLowerCase().includes(q) || g.group?.toLowerCase().includes(q)) : s.guests
  const groupNames = [...new Set(visible.map((g) => g.group ?? ''))].sort((a, b) => a.localeCompare(b))

  const cycleRule = (group: string) => {
    const cur = s.groupRules.find((r) => r.group === group)
    const next: 'cluster' | 'spread' | null = !cur ? 'cluster' : cur.mode === 'cluster' ? 'spread' : null
    update(
      (st) => ({
        ...st,
        groupRules: [...st.groupRules.filter((r) => r.group !== group), ...(next ? [{ group, mode: next }] : [])],
      }),
      {
        actor: 'human',
        describe: next
          ? `rule for "${group}": ${next === 'spread' ? 'mix across tables' : 'keep together'}`
          : `removed the rule for "${group}"`,
      }
    )
    announce(
      next === 'spread'
        ? `"${group}" will be mixed across tables — press ✨ Arrange (or ask your agent) to apply.`
        : next === 'cluster'
          ? `"${group}" will be kept together — press ✨ Arrange (or ask your agent) to apply.`
          : `Rule removed for "${group}".`
    )
  }

  return (
    <section className="panel">
      <h2>
        {v.people} <span className="count">{unseated} unseated / {s.guests.length}</span>
      </h2>
      <form
        className="add-guest"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          update(
            (st) => ({
              ...st,
              guests: [...st.guests, { id: uid('g'), name: n, diet: 'none', tableId: null }],
            }),
            { actor: 'human', describe: `added ${v.person.toLowerCase()} ${n}` }
          )
          setName('')
        }}
      >
        <input placeholder={`Add ${v.person.toLowerCase()}…`} value={name} onChange={(e) => setName(e.target.value)} />
      </form>
      <button className="link-btn" onClick={() => setImporting(true)}>⤓ Paste a whole list…</button>
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {s.guests.length > 8 && (
        <input
          className="pool-search"
          placeholder="Filter by name or group…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {groupNames.map((group) => {
        const members = visible.filter((g) => (g.group ?? '') === group)
        const seatedN = members.filter((g) => g.tableId != null).length
        const rule = s.groupRules.find((r) => r.group === group)
        const isOpen = !collapsed[group]
        return (
          <div key={group || '(no group)'} className="group-block">
            <div className="group-head">
              <button
                className="group-toggle"
                onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
                title={isOpen ? 'Collapse' : 'Expand'}
              >
                <span className="group-dot" style={{ background: groupColor(group || undefined) }} />
                <span className="group-name">{group || 'No group'}</span>
                <span className="count">{seatedN}/{members.length}</span>
              </button>
              {group && (
                <button
                  className={`rule-chip ${rule?.mode ?? 'none'}`}
                  onClick={() => cycleRule(group)}
                  title="Placement rule — click to cycle: none → keep together → mix across tables"
                >
                  {rule?.mode === 'spread' ? '⇢ mix' : rule?.mode === 'cluster' ? '⇠ keep' : '· rule'}
                </button>
              )}
            </div>
            {isOpen && (
              <div className="pool">
                {members.map((g) => (
                  <GuestChip key={g.id} guest={g} tableLabel={s.tables.find((t) => t.id === g.tableId)?.label} />
                ))}
              </div>
            )}
          </div>
        )
      })}
      {s.guests.length === 0 && <div className="empty">Pick a template or ask your agent to import a list.</div>}
    </section>
  )
}

function GuestChip({ guest, tableLabel }: { guest: Guest; tableLabel?: string }) {
  return (
    <div
      className={`chip ${guest.accessibility ? 'access' : ''} ${tableLabel ? 'seated-chip' : ''}`}
      style={tableLabel ? undefined : ({ viewTransitionName: `g${guest.id}` } as React.CSSProperties)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/guest-id', guest.id)}
      title={[guest.group, guest.diet !== 'none' ? guest.diet : null, tableLabel ? `at ${tableLabel}` : 'unseated'].filter(Boolean).join(' · ')}
    >
      {guest.name}
      {guest.diet !== 'none' && <span className="diet">{DIET_ICON[guest.diet] ?? ''}</span>}
      {guest.accessibility && <span className="diet">♿</span>}
      {guest.pinned && <span className="diet">📌</span>}
      {tableLabel && <span className="chip-table">{tableLabel}</span>}
    </div>
  )
}

// ---------------- Paste import ----------------

const DIET_WORDS: Record<string, Diet> = {
  vegetarian: 'vegetarian', veg: 'vegetarian', vejetaryen: 'vegetarian',
  vegan: 'vegan',
  'gluten-free': 'gluten-free', gluten: 'gluten-free', gf: 'gluten-free', glutensiz: 'gluten-free',
  halal: 'halal', helal: 'halal',
  kosher: 'kosher', koşer: 'kosher',
}
const ACCESS_WORDS = new Set(['wheelchair', 'accessible', 'access', '♿', 'tekerlekli', 'erişilebilir'])

function parseGuestLines(text: string): Omit<Guest, 'id' | 'tableId'>[] {
  const out: Omit<Guest, 'id' | 'tableId'>[] = []
  for (const raw of text.split('\n')) {
    let line = raw.trim()
    if (!line) continue
    // "Name (group)" → "Name, group"
    line = line.replace(/\(([^)]+)\)/, ', $1')
    const parts = line.split(/[\t,;|]+|\s+-\s+/).map((p) => p.trim()).filter(Boolean)
    if (!parts.length) continue
    const name = parts[0]
    let diet: Diet = 'none'
    let accessibility = false
    let group: string | undefined
    for (const p of parts.slice(1)) {
      const low = p.toLowerCase()
      if (DIET_WORDS[low]) diet = DIET_WORDS[low]
      else if (ACCESS_WORDS.has(low)) accessibility = true
      else if (!group) group = p
    }
    out.push({ name, diet, accessibility, group })
  }
  return out
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const s = useApp()
  const v = vocab(s)
  const [text, setText] = useState('')
  const parsed = parseGuestLines(text)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Paste your {v.people.toLowerCase()}</h3>
        <p className="modal-hint">
          One per line. Extras after a comma become group / diet / accessibility — e.g.{' '}
          <code>Ayşe, bride's family, vegetarian</code> · <code>Karl (Umbrella), wheelchair</code>
        </p>
        <textarea
          autoFocus
          placeholder={'Ayşe, bride’s family, vegetarian\nRobert, groom’s family\nSelin (college friends), vegan'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="modal-actions">
          <span className="count">{parsed.length ? `${parsed.length} ${parsed.length === 1 ? v.person.toLowerCase() : v.people.toLowerCase()} detected` : ''}</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={parsed.length === 0}
            onClick={() => {
              update(
                (st) => ({
                  ...st,
                  guests: [...st.guests, ...parsed.map((p) => ({ ...p, id: uid('g'), tableId: null }))],
                }),
                { actor: 'human', describe: `imported ${parsed.length} ${v.people.toLowerCase()}` }
              )
              announce(`Imported ${parsed.length} — press ✨ Arrange or ask your agent to seat them.`)
              onClose()
            }}
          >
            Import {parsed.length || ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------- Conflicts ----------------

function ConflictDock() {
  const s = useApp()
  const [open, setOpen] = useState(true)
  const list = conflicts(s)
  if (s.tables.length === 0) return null
  if (list.length === 0) {
    return s.guests.length > 0 ? <div className="conflict-dock clean">All clear — no conflicts</div> : null
  }
  return (
    <div className="conflict-dock">
      <button className="dock-head" onClick={() => setOpen(!open)}>
        <span className="dock-flame">⚠</span>
        <strong>{list.length} to resolve</strong>
        <span className="dock-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="dock-list">
          {list.map((c, i) => (
            <button
              key={i}
              className={`dock-item ${c.severity}`}
              onClick={() => {
                if (c.tableId)
                  update((st) => ({ ...st, selection: { type: 'table', id: c.tableId! } }), { undoable: false })
              }}
            >
              {c.message}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Activity feed ----------------

function ActivityFeed() {
  const s = useApp()
  return (
    <section className="panel grow">
      <h2>Activity</h2>
      <div className="feed">
        {s.log.map((l) => (
          <div key={l.id} className={`log ${l.actor}`}>
            <span className="who">{l.actor === 'agent' ? '✳ agent' : '● you'}</span> {l.text}
          </div>
        ))}
        {s.log.length === 0 && <div className="empty">Actions by you and your agent appear here.</div>}
      </div>
    </section>
  )
}

// ---------------- Board ----------------

function Board() {
  const s = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  // board coords from a pointer event, accounting for scroll and zoom
  const toBoard = (e: { clientX: number; clientY: number }) => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    return {
      x: (e.clientX - r.left + el.scrollLeft) / zoom,
      y: (e.clientY - r.top + el.scrollTop) / zoom,
    }
  }

  const extent = s.tables.reduce(
    (acc, t) => ({ w: Math.max(acc.w, t.x + 260), h: Math.max(acc.h, t.y + 260) }),
    { w: 1200, h: 900 }
  )

  // auto-fit when a template loads or the table set changes size significantly
  const lastFitKey = useRef('')
  useEffect(() => {
    const key = `${s.event.template ?? ''}:${s.tables.length}`
    if (key !== lastFitKey.current) {
      lastFitKey.current = key
      if (s.tables.length > 0) requestAnimationFrame(() => fit())
    }
  })

  const fit = () => {
    const el = ref.current
    if (!el || s.tables.length === 0) return
    const xs = s.tables.map((t) => t.x)
    const ys = s.tables.map((t) => t.y)
    const pad = 160
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    const w = Math.max(...xs) - minX + pad * 2
    const h = Math.max(...ys) - minY + pad * 2
    const z = Math.min(el.clientWidth / w, el.clientHeight / h, 1)
    setZoom(z)
    requestAnimationFrame(() => {
      el.scrollLeft = minX * z
      el.scrollTop = minY * z
    })
  }

  return (
    <div className="board-wrap">
    <div
      className="board"
      ref={ref}
      onPointerMove={(e) => {
        if (!drag.current) return
        const { id, dx, dy } = drag.current
        const p = toBoard(e)
        update(
          (st) => ({ ...st, tables: st.tables.map((t) => (t.id === id ? { ...t, x: p.x - dx, y: p.y - dy } : t)) }),
          { undoable: false }
        )
      }}
      onPointerUp={() => (drag.current = null)}
      onClick={(e) => {
        if (e.target === ref.current || (e.target as HTMLElement).classList?.contains('board-inner'))
          update((st) => ({ ...st, selection: null }), { undoable: false })
      }}
    >
      <div
        className="board-inner"
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: extent.w, height: extent.h }}
      >
      {s.tables.map((t, i) => (
        <TableView
          key={t.id}
          table={t}
          index={i}
          selected={s.selection?.type === 'table' && s.selection.id === t.id}
          onGrab={(e) => {
            const p = toBoard(e)
            drag.current = { id: t.id, dx: p.x - t.x, dy: p.y - t.y }
          }}
        />
      ))}
      <AgentCursor />
      </div>
      {s.tables.length === 0 && (
        <div className="board-empty">
          <p className="empty-title">What are we arranging today?</p>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => {
                  loadTemplate(t.id, 'human')
                  announce('Loaded. Press ✨ Arrange to seat everyone — or ask your agent to propose a plan.')
                }}
              >
                <span className="template-icon">{t.icon}</span>
                <span className="template-title">{t.title}</span>
                <span className="template-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
          <p className="hint">…or start from scratch: ask your agent to add tables and import your list.</p>
        </div>
      )}
    </div>
    {s.tables.length > 0 && (
      <div className="zoom-controls">
        <button className="btn" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}>+</button>
        <button className="btn" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}>−</button>
        <button className="btn" onClick={fit} title="Fit the whole room in view">⤢</button>
      </div>
    )}
    <ConflictDock />
    <ProposalBanner />
    </div>
  )
}

function ProposalBanner() {
  const s = useApp()
  const [openList, setOpenList] = useState(false)
  if (!s.proposal) return null
  const p = s.proposal
  const tname = (id: string | null) => (id ? s.tables.find((t) => t.id === id)?.label ?? '?' : 'unassigned')
  return (
    <div className="proposal">
      <div className="proposal-row">
        <span className="proposal-mark">✳</span>
        <div className="proposal-text">
          <strong>Your agent proposes {p.moves.length} moves</strong>
          <span className="proposal-note">{p.note}</span>
        </div>
        <button className="btn" onClick={() => setOpenList(!openList)}>
          {openList ? 'Hide' : 'Review'}
        </button>
        <button className="btn primary" onClick={() => applyProposal('human')}>Accept</button>
        <button className="btn" onClick={() => dismissProposal('human')}>Dismiss</button>
      </div>
      {openList && (
        <ul className="proposal-moves">
          {p.moves.map((m) => {
            const g = s.guests.find((g) => g.id === m.guestId)
            return (
              <li key={m.guestId}>
                <strong>{g?.name}</strong> {tname(m.from)} → {tname(m.to)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const GROUP_COLORS = ['#d0784a', '#7fa869', '#8d7dd6', '#c96a90', '#5fa3b5', '#c2a04a', '#a5776d', '#6b93a8']

function groupColor(group?: string): string {
  if (!group) return '#9b917f'
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) | 0
  return GROUP_COLORS[Math.abs(h) % GROUP_COLORS.length]
}

const HONORIFICS = new Set(['aunt', 'uncle', 'grandma', 'grandpa', 'cousin', 'ex-colleague', 'dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'])

function shortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  if (HONORIFICS.has(parts[0].toLowerCase())) return name.length <= 14 ? name : parts.slice(1).join(' ')
  return parts[0]
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase()
}

function TableView({
  table,
  index,
  selected,
  onGrab,
}: {
  table: Table
  index: number
  selected: boolean
  onGrab: (e: React.PointerEvent) => void
}) {
  const s = useApp()
  const seated = guestsAt(s, table.id)
  const over = seated.length > table.capacity
  const tableConflicts = conflicts(s).filter((c) => c.tableId === table.id)
  const cfHere = tableConflicts.some((c) => c.severity === 'error')

  const D = 150 // tabletop diameter
  const R = D / 2 + 27 // seat ring radius
  const seatCount = Math.max(table.capacity, seated.length)
  const seats = Array.from({ length: seatCount }, (_, i) => {
    const angle = (i / seatCount) * Math.PI * 2 - Math.PI / 2
    return {
      x: Math.cos(angle) * R,
      y: Math.sin(angle) * R,
      guest: seated[i] as Guest | undefined,
    }
  })

  return (
    <div
      className={`table round ${selected ? 'selected' : ''} ${cfHere ? 'has-conflict' : ''}`}
      style={{ left: table.x, top: table.y, animationDelay: `${Math.min(index * 45, 700)}ms` }}
      onClick={(e) => {
        e.stopPropagation()
        update((st) => ({ ...st, selection: { type: 'table', id: table.id } }), { undoable: false })
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const gid = e.dataTransfer.getData('text/guest-id')
        if (!gid) return
        const g = getState().guests.find((g) => g.id === gid)
        update(
          (st) => ({
            ...st,
            guests: st.guests.map((x) => (x.id === gid ? { ...x, tableId: table.id, pinned: true } : x)),
          }),
          { actor: 'human', describe: `seated ${g?.name ?? 'guest'} at ${table.label} 📌` }
        )
      }}
    >
      <div className="tabletop" onPointerDown={onGrab}>
        <span className="table-label">{table.label}</span>
        <span className={`cap ${over ? 'over' : ''}`}>
          {seated.length}/{table.capacity}{table.accessible ? ' ♿' : ''}
        </span>
      </div>
      {tableConflicts.length > 0 && (
        <div className="conflict-tag" onPointerDown={(e) => e.stopPropagation()}>
          <span className="conflict-count">{tableConflicts.length}</span>
          <div className="conflict-bubbles">
            {tableConflicts.map((c, i) => (
              <div key={i} className={`bubble ${c.severity}`}>
                {c.message}
              </div>
            ))}
          </div>
        </div>
      )}
      {seats.map((seat, i) =>
        seat.guest ? (
          <div
            key={seat.guest.id}
            className={`seat filled ${seat.guest.pinned ? 'pinned' : ''}`}
            style={{
              transform: `translate(${seat.x}px, ${seat.y}px)`,
              background: groupColor(seat.guest.group),
              viewTransitionName: `g${seat.guest.id}`,
            } as React.CSSProperties}
            title={[seat.guest.name, seat.guest.group, seat.guest.diet !== 'none' ? seat.guest.diet : null, seat.guest.accessibility ? 'accessible seating' : null, seat.guest.pinned ? 'pinned — double-click to unpin' : 'double-click to pin'].filter(Boolean).join(' · ')}
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.setData('text/guest-id', seat.guest!.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              const g = seat.guest!
              update(
                (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, pinned: !g.pinned } : x)) }),
                { actor: 'human', describe: `${g.pinned ? 'unpinned' : 'pinned'} ${g.name}` }
              )
            }}
          >
            {initials(seat.guest.name)}
            {seat.guest.diet !== 'none' && <span className="seat-badge">{DIET_ICON[seat.guest.diet] ?? ''}</span>}
            {seat.guest.accessibility && <span className="seat-badge low">♿</span>}
            {seat.guest.pinned && <span className="seat-badge pin">📌</span>}
            <span className="seat-name">{shortName(seat.guest.name)}</span>
          </div>
        ) : (
          <div key={`e${i}`} className="seat empty" style={{ transform: `translate(${seat.x}px, ${seat.y}px)` }} />
        )
      )}
    </div>
  )
}

function AgentCursor() {
  const s = useApp()
  if (!s.agentFocus) return null
  return (
    <div className="agent-cursor" style={{ left: s.agentFocus.x, top: s.agentFocus.y }}>
      <div className="agent-dot">✳</div>
      <div className="agent-label">{s.agentFocus.label}</div>
    </div>
  )
}
