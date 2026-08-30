import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getState,
  subscribe,
  update,
  undo,
  guestsAt,
  conflicts,
  uid,
  type Guest,
  type Table,
} from './model'
import { registerBaseTools, syncSelectionTools, webmcpAvailable } from './webmcp'
import { seedDemo } from './demo'
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
          {s.guests.length === 0 ? (
            <button className="btn primary" onClick={seedDemo}>Load sample event</button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                if (confirm('Clear the whole plan?')) {
                  localStorage.removeItem('duet-plan-v1')
                  update(
                    (st) => ({ ...st, guests: [], tables: [], constraints: [], selection: null }),
                    { actor: 'human', describe: 'cleared the plan' }
                  )
                }
              }}
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <GuestPool guests={unassigned} allGuests={s.guests} />
          <ConflictPanel conflictsList={cf} />
          <ActivityFeed />
        </aside>
        <Board />
      </div>
    </div>
  )
}

// ---------------- Guest pool ----------------

function GuestPool({ guests, allGuests }: { guests: Guest[]; allGuests: Guest[] }) {
  const [name, setName] = useState('')
  return (
    <section className="panel">
      <h2>
        Guests <span className="count">{guests.length} unseated / {allGuests.length}</span>
      </h2>
      <form
        className="add-guest"
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (!n) return
          update(
            (s) => ({
              ...s,
              guests: [...s.guests, { id: uid('g'), name: n, diet: 'none', tableId: null }],
            }),
            { actor: 'human', describe: `added guest ${n}` }
          )
          setName('')
        }}
      >
        <input placeholder="Add guest…" value={name} onChange={(e) => setName(e.target.value)} />
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
          <p>No tables yet.</p>
          <p className="hint">Click “Load sample event”, or ask your agent: “set up 6 tables of 8 for a wedding”.</p>
        </div>
      )}
      <AgentCursor />
    </div>
  )
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

  return (
    <div
      className={`table ${table.shape} ${selected ? 'selected' : ''} ${cfHere ? 'has-conflict' : ''}`}
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
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === gid ? { ...x, tableId: table.id } : x)) }),
          { actor: 'human', describe: `seated ${g?.name ?? 'guest'} at ${table.label}` }
        )
      }}
    >
      <div className="table-head" onPointerDown={onGrab}>
        <span className="table-label">{table.label}</span>
        <span className={`cap ${over ? 'over' : ''}`}>
          {seated.length}/{table.capacity} {table.accessible ? '♿' : ''}
        </span>
      </div>
      <div className="seats">
        {seated.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
      </div>
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
