import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getState,
  subscribe,
  update,
  undo,
  guestsAt,
  conflicts,
  vocab,
  applyProposal,
  dismissProposal,
  uid,
  type Guest,
  type Table,
} from './model'
import { registerBaseTools, syncSelectionTools, webmcpAvailable, exportMarkdown } from './webmcp'
import { TEMPLATES, loadTemplate } from './templates'
import './App.css'

function useApp() {
  return useSyncExternalStore(subscribe, getState)
}

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

  useEffect(() => {
    registerBaseTools()
  }, [])

  useEffect(() => {
    syncSelectionTools()
  }, [s.selection])

  const cf = conflicts(s)
  const unassigned = s.guests.filter((g) => g.tableId == null)

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
          <GuestPool guests={unassigned} allGuests={s.guests} />
          <ConflictPanel conflictsList={cf} />
          <ActivityFeed />
        </aside>
        <Board />
        <HelpButton mcp={mcp} />
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

function GuestPool({ guests, allGuests }: { guests: Guest[]; allGuests: Guest[] }) {
  const s = useApp()
  const v = vocab(s)
  const [name, setName] = useState('')
  return (
    <section className="panel">
      <h2>
        {v.people} <span className="count">{guests.length} unseated / {allGuests.length}</span>
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
      <div className="pool">
        {guests.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
        {guests.length === 0 && <div className="empty">Everyone is seated 🎉</div>}
      </div>
    </section>
  )
}

function GuestChip({ guest }: { guest: Guest }) {
  return (
    <div
      className={`chip ${guest.accessibility ? 'access' : ''}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/guest-id', guest.id)}
      title={[guest.group, guest.diet !== 'none' ? guest.diet : null].filter(Boolean).join(' · ')}
    >
      {guest.name}
      {guest.diet !== 'none' && <span className="diet">{DIET_ICON[guest.diet] ?? ''}</span>}
      {guest.accessibility && <span className="diet">♿</span>}
    </div>
  )
}

// ---------------- Conflicts ----------------

function ConflictPanel({ conflictsList }: { conflictsList: ReturnType<typeof conflicts> }) {
  return (
    <section className="panel">
      <h2>
        Conflicts{' '}
        <span className={`count ${conflictsList.length ? 'bad' : 'good'}`}>{conflictsList.length}</span>
      </h2>
      <div className="conflicts">
        {conflictsList.length === 0 && <div className="empty">No conflicts — clean plan ✓</div>}
        {conflictsList.map((c, i) => (
          <div key={i} className={`conflict ${c.severity}`}>
            {c.message}
          </div>
        ))}
      </div>
    </section>
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

  return (
    <div
      className="board"
      ref={ref}
      onPointerMove={(e) => {
        if (!drag.current) return
        const r = ref.current!.getBoundingClientRect()
        const { id, dx, dy } = drag.current
        const x = e.clientX - r.left - dx
        const y = e.clientY - r.top - dy
        update(
          (st) => ({ ...st, tables: st.tables.map((t) => (t.id === id ? { ...t, x, y } : t)) }),
          { undoable: false }
        )
      }}
      onPointerUp={() => (drag.current = null)}
      onClick={(e) => {
        if (e.target === ref.current) update((st) => ({ ...st, selection: null }), { undoable: false })
      }}
    >
      {s.tables.map((t) => (
        <TableView
          key={t.id}
          table={t}
          selected={s.selection?.type === 'table' && s.selection.id === t.id}
          onGrab={(e) => {
            const r = ref.current!.getBoundingClientRect()
            drag.current = { id: t.id, dx: e.clientX - r.left - t.x, dy: e.clientY - r.top - t.y }
          }}
        />
      ))}
      {s.tables.length === 0 && (
        <div className="board-empty">
          <p className="empty-title">What are we arranging today?</p>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="template-card" onClick={() => loadTemplate(t.id, 'human')}>
                <span className="template-icon">{t.icon}</span>
                <span className="template-title">{t.title}</span>
                <span className="template-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
          <p className="hint">…or start from scratch: ask your agent to add tables and import your list.</p>
        </div>
      )}
      <ProposalBanner />
      <AgentCursor />
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

const GROUP_COLORS = ['#c2703f', '#6d8f5b', '#7a6bb5', '#b05c7d', '#5b8a99', '#a68a3d', '#8a655f', '#5f7d8a']

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
  selected,
  onGrab,
}: {
  table: Table
  selected: boolean
  onGrab: (e: React.PointerEvent) => void
}) {
  const s = useApp()
  const seated = guestsAt(s, table.id)
  const over = seated.length > table.capacity
  const cfHere = conflicts(s).some((c) => c.tableId === table.id && c.severity === 'error')

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
      style={{ left: table.x, top: table.y }}
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
      {seats.map((seat, i) =>
        seat.guest ? (
          <div
            key={seat.guest.id}
            className={`seat filled ${seat.guest.pinned ? 'pinned' : ''}`}
            style={{ transform: `translate(${seat.x}px, ${seat.y}px)`, background: groupColor(seat.guest.group) }}
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
