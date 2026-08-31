import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getState,
  subscribe,
  update,
  undo,
  redo,
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
import { sound, soundMuted, setSoundMuted } from './sound'
import {
  IcUndo, IcRedo, IcSoundOn, IcSoundOff, IcPrint, IcExport, IcReset, IcPlus, IcMinus, IcFit,
  IcSparkle, IcPin, IcClose, IcCaretDown, IcCaretRight, IcWarn,
} from './icons'
import './App.css'

function useApp() {
  return useSyncExternalStore(subscribe, getState)
}

// tiny toast channel — any component can announce, App renders it
let announce: (msg: string) => void = () => {}

// smooth-scroll helper: scrollTo({behavior:'smooth'}) is unreliable in some
// embedded browsers, so ease the scroll position by hand
function panTo(el: HTMLElement, left: number, top: number, ms = 550) {
  const sl = el.scrollLeft
  const st = el.scrollTop
  const t0 = performance.now()
  let ticked = false
  const step = (now: number) => {
    ticked = true
    const p = Math.min(1, (now - t0) / ms)
    const e = 1 - Math.pow(1 - p, 3)
    el.scrollLeft = sl + (left - sl) * e
    el.scrollTop = st + (top - st) * e
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  // rAF starves in non-compositing contexts (hidden panes, some embeds) — jump instead
  setTimeout(() => {
    if (!ticked) {
      el.scrollLeft = left
      el.scrollTop = top
    }
  }, 130)
}

const DIET_ICON: Record<string, string> = {
  vegetarian: '🥬',
  vegan: '🌱',
  'gluten-free': '🌾',
  halal: '🕌',
  kosher: '✡️',
}

/** Human-readable relationship notes for one guest ("keep apart from X — divorced"). */
function relationNotes(s: ReturnType<typeof getState>, guestId: string): string[] {
  return s.constraints
    .filter((c) => c.a === guestId || c.b === guestId)
    .map((c) => {
      const other = s.guests.find((g) => g.id === (c.a === guestId ? c.b : c.a))
      return `${c.kind === 'apart' ? '⚡ keep apart from' : '❤ sit with'} ${other?.name ?? '?'}${c.note ? ` — ${c.note}` : ''}`
    })
}

export default function App() {
  const s = useApp()
  const [mcp] = useState(() => webmcpAvailable())
  const [sideOpen, setSideOpen] = useState(false)
  const [mutedUi, setMutedUi] = useState(() => soundMuted())
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    registerBaseTools()
    announce = (msg: string) => {
      setToast(msg)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 3200)
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      announce = () => {}
      window.removeEventListener('keydown', onKey)
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
          <span className={`mcp-badge ${mcp ? 'on' : 'off'}`} title={mcp ? 'This page exposes WebMCP tools to your agent' : 'Open in ChatGPT’s browser or Chrome with WebMCP enabled'}>
            {mcp ? 'Agent connected' : 'No agent detected'}
          </span>
          <span className="tb-sep" />
          <button className="btn icon-btn" title="Undo (⌘Z)" onClick={() => undo()}><IcUndo /></button>
          <button className="btn icon-btn" title="Redo (⌘⇧Z)" onClick={() => redo()}><IcRedo /></button>
          <button
            className="btn icon-btn"
            title={mutedUi ? 'Sound is off' : 'Sound is on'}
            onClick={() => {
              setSoundMuted(!soundMuted())
              setMutedUi(soundMuted())
              if (!soundMuted()) sound.tick()
            }}
          >
            {mutedUi ? <IcSoundOff /> : <IcSoundOn />}
          </button>
          <span className="tb-sep" />
          {s.guests.length > 0 && s.tables.length > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                const { seats, moves, remaining } = computeArrangement(false)
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
                sound.success()
                announce(
                  remaining.length === 0
                    ? `Arranged — ${moves} moves, no conflicts. Now drag anyone anywhere: Duet flags trouble the moment it appears.`
                    : `Arranged — ${moves} moves, ${remaining.length} conflict${remaining.length === 1 ? '' : 's'} left (see the dock).`
                )
              }}
            >
              <IcSparkle /> Arrange
            </button>
          )}
          {s.guests.length > 0 && (
            <>
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(exportMarkdown(getState())).then(
                    () => announce('Plan copied as markdown — paste it into email, Notes, anywhere.'),
                    () => announce('Could not access the clipboard.')
                  )
                }}
              >
                <IcExport /> <span className="btn-label">Export</span>
              </button>
              <button className="btn icon-btn" title="Print place cards & the seating plan" onClick={() => window.print()}>
                <IcPrint />
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (confirm('Clear the whole plan?')) {
                    sessionStorage.removeItem('duet-plan-v1')
                    update(
                      (st) => ({ ...st, guests: [], tables: [], constraints: [], proposal: null, selection: null }),
                      { actor: 'human', describe: 'cleared the plan' }
                    )
                  }
                }}
              >
                <IcReset /> <span className="btn-label">Reset</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="main">
        <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
          <GuestPool />
          <RelationshipsPanel />
          <ActivityFeed />
          <Legend />
        </aside>
        <Board />
        <HelpButton mcp={mcp} />
        {toast && <div className="toast">{toast}</div>}
      </div>
      <PrintSheet />
    </div>
  )
}

// ---------------- Print sheet (visible only when printing) ----------------

function PrintSheet() {
  const s = useApp()
  if (s.guests.length === 0) return null
  const seatedTables = s.tables.map((t) => ({ table: t, guests: guestsAt(s, t.id) }))
  const escort = [...s.guests]
    .filter((g) => g.tableId != null)
    .sort((a, b) => a.name.localeCompare(b.name))
  const diets = s.guests.filter((g) => g.diet !== 'none')
  return (
    <div className="print-sheet">
      <h1>{s.event.name}</h1>
      <p className="print-sub">Seating plan — {s.guests.length} guests, {s.tables.length} tables</p>

      <h2>Find your seat</h2>
      <div className="print-escort">
        {escort.map((g) => (
          <div key={g.id} className="print-escort-row">
            <span>{g.name}</span>
            <span className="print-dots" />
            <span>{s.tables.find((t) => t.id === g.tableId)?.label}</span>
          </div>
        ))}
      </div>

      <h2>Tables</h2>
      <div className="print-tables">
        {seatedTables.map(({ table, guests }) => (
          <div key={table.id} className="print-table">
            <h3>
              {table.label} <small>({guests.length}/{table.capacity}{table.accessible ? ' · accessible' : ''})</small>
            </h3>
            <ul>
              {guests.map((g) => (
                <li key={g.id}>
                  {g.name}
                  {g.diet !== 'none' ? ` — ${g.diet}` : ''}
                  {g.accessibility ? ' — accessible seat' : ''}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {diets.length > 0 && (
        <>
          <h2>Catering notes</h2>
          <ul className="print-diets">
            {diets.map((g) => (
              <li key={g.id}>
                {g.name}: {g.diet} ({s.tables.find((t) => t.id === g.tableId)?.label ?? 'unseated'})
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="print-foot">Made with Duet — plan the room with your agent · duet-ten.vercel.app</p>
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
  const [editingGuest, setEditingGuest] = useState<string | null>(null)

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
                  <GuestChip key={g.id} guest={g} tableLabel={s.tables.find((t) => t.id === g.tableId)?.label} onEdit={setEditingGuest} />
                ))}
              </div>
            )}
          </div>
        )
      })}
      {s.guests.length === 0 && <div className="empty">Pick a template or ask your agent to import a list.</div>}
      {editingGuest && <GuestEditModal id={editingGuest} onClose={() => setEditingGuest(null)} />}
    </section>
  )
}

function GuestEditModal({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useApp()
  const g = s.guests.find((x) => x.id === id)
  const v = vocab(s)
  const [name, setName] = useState(g?.name ?? '')
  const [group, setGroup] = useState(g?.group ?? '')
  const [diet, setDiet] = useState<Diet>(g?.diet ?? 'none')
  const [access, setAccess] = useState(!!g?.accessibility)
  if (!g) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-slim" onClick={(e) => e.stopPropagation()}>
        <h3>Edit {v.person.toLowerCase()}</h3>
        <div className="edit-grid">
          <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Group<input value={group} placeholder="e.g. bride's family" onChange={(e) => setGroup(e.target.value)} /></label>
          <label>Diet
            <select value={diet} onChange={(e) => setDiet(e.target.value as Diet)}>
              {(['none', 'vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher'] as Diet[]).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="edit-check">
            <input type="checkbox" checked={access} onChange={(e) => setAccess(e.target.checked)} /> ♿ needs accessible seating
          </label>
        </div>
        <div className="modal-actions">
          <button
            className="btn insp-del"
            onClick={() => {
              if (!confirm(`Remove ${g.name} from the event?`)) return
              update(
                (st) => ({
                  ...st,
                  guests: st.guests.filter((x) => x.id !== g.id),
                  constraints: st.constraints.filter((c) => c.a !== g.id && c.b !== g.id),
                }),
                { actor: 'human', describe: `removed ${g.name}` }
              )
              onClose()
            }}
          >
            <IcClose /> Remove
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              update(
                (st) => ({
                  ...st,
                  guests: st.guests.map((x) =>
                    x.id === g.id
                      ? { ...x, name: name.trim(), group: group.trim() || undefined, diet, accessibility: access }
                      : x
                  ),
                }),
                { actor: 'human', describe: `updated ${name.trim()}` }
              )
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function GuestChip({ guest, tableLabel, onEdit }: { guest: Guest; tableLabel?: string; onEdit?: (id: string) => void }) {
  const s = useApp()
  const relations = relationNotes(s, guest.id)
  return (
    <div
      className={`chip ${guest.accessibility ? 'access' : ''} ${tableLabel ? 'seated-chip' : ''}`}
      style={tableLabel ? undefined : ({ viewTransitionName: `g${guest.id}` } as React.CSSProperties)}
      draggable
      onDoubleClick={() => onEdit?.(guest.id)}
      onDragStart={(e) => e.dataTransfer.setData('text/guest-id', guest.id)}
      title={[
        guest.group,
        guest.diet !== 'none' ? `${DIET_ICON[guest.diet] ?? ''} ${guest.diet}` : null,
        guest.accessibility ? '♿ needs accessible seating' : null,
        tableLabel ? `at ${tableLabel}` : 'unseated',
        ...relations,
      ].filter(Boolean).join('\n')}
    >
      {guest.name}
      {guest.diet !== 'none' && <span className="diet">{DIET_ICON[guest.diet] ?? ''}</span>}
      {guest.accessibility && <span className="diet">♿</span>}
      {guest.pinned && <span className="diet pin-mark"><IcPin /></span>}
      {relations.length > 0 && <span className="diet rel">{relations.some((r) => r.startsWith('⚡')) ? '⚡' : '❤'}</span>}
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
  if (s.tables.length === 0 || list.length === 0) return null
  return (
    <div className="conflict-dock">
      <button className="dock-head" onClick={() => setOpen(!open)}>
        <span className="dock-flame"><IcWarn /></span>
        <strong key={list.length} className="dock-count">{list.length} to resolve</strong>
        <span className="dock-caret">{open ? <IcCaretDown /> : <IcCaretRight />}</span>
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

// ---------------- Relationships ----------------

function RelationshipsPanel() {
  const s = useApp()
  const [adding, setAdding] = useState(false)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [kind, setKind] = useState<'apart' | 'together'>('apart')
  const [note, setNote] = useState('')
  if (s.guests.length === 0) return null
  const name = (id: string) => s.guests.find((g) => g.id === id)?.name ?? '?'
  return (
    <section className="panel">
      <h2>
        Relationships <span className="count">{s.constraints.length}</span>
      </h2>
      <div className="relations">
        {s.constraints.map((c) => (
          <div key={c.id} className={`relation ${c.kind}`}>
            <span className="rel-icon">{c.kind === 'apart' ? '⚡' : '❤'}</span>
            <span className="rel-text">
              <strong>{name(c.a)}</strong> {c.kind === 'apart' ? '×' : '+'} <strong>{name(c.b)}</strong>
              {c.note && <em> — {c.note}</em>}
            </span>
            <button
              className="rel-del"
              title="Remove this rule"
              onClick={() =>
                update(
                  (st) => ({ ...st, constraints: st.constraints.filter((x) => x.id !== c.id) }),
                  { actor: 'human', describe: `removed rule: ${name(c.a)} ${c.kind} ${name(c.b)}` }
                )
              }
            >
              <IcClose />
            </button>
          </div>
        ))}
        {s.constraints.length === 0 && <div className="empty">No feuds, no couples — yet.</div>}
      </div>
      {adding ? (
        <form
          className="rel-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!a || !b || a === b) return
            update(
              (st) => ({
                ...st,
                constraints: [...st.constraints, { id: uid('c'), kind, a, b, note: note.trim() || undefined }],
              }),
              { actor: 'human', describe: `rule: ${name(a)} & ${name(b)} ${kind}${note ? ` (${note})` : ''}` }
            )
            setA(''); setB(''); setNote(''); setAdding(false)
          }}
        >
          <div className="rel-form-row">
            <select value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">Who…</option>
              {s.guests.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button
              type="button"
              className={`kind-toggle ${kind}`}
              title="Toggle: keep apart / sit together"
              onClick={() => setKind(kind === 'apart' ? 'together' : 'apart')}
            >
              {kind === 'apart' ? '⚡ apart' : '❤ together'}
            </button>
            <select value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">…and who</option>
              {s.guests.filter((g) => g.id !== a).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="rel-form-row">
            <input placeholder="Why? (optional — e.g. divorced in 2019)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!a || !b}>Add</button>
            <button className="btn" type="button" onClick={() => setAdding(false)}>✕</button>
          </div>
        </form>
      ) : (
        <button className="link-btn" style={{ paddingBottom: 0 }} onClick={() => setAdding(true)}>
          + Add a feud or a pair…
        </button>
      )}
    </section>
  )
}

// ---------------- Legend ----------------

function Legend() {
  const s = useApp()
  if (s.guests.length === 0) return null
  return (
    <div className="legend">
      <span>🥬 vegetarian</span>
      <span>🌱 vegan</span>
      <span>🌾 gluten-free</span>
      <span>🕌 halal</span>
      <span>✡️ kosher</span>
      <span>♿ accessible</span>
      <span className="legend-pin"><IcPin /> pinned by you</span>
      <span>⚡ feud</span>
      <span>❤ sit together</span>
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
            <span className="who">{l.actor === 'agent' ? '✳ agent' : '● you'}</span>
            <span className="log-text">{l.text}</span>
            <span className="log-time">
              {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
  const [shakeId, setShakeId] = useState<string | null>(null)

  // When a NEW conflict appears, the room reacts: pan to the offending table,
  // shake it, and let the dock flare. Silence is for clean rooms only.
  const prevConflicts = useRef<Set<string>>(new Set())
  useEffect(() => {
    const list = conflicts(s)
    const keys = new Set(list.map((c) => c.message))
    const fresh = list.filter((c) => !prevConflicts.current.has(c.message))
    prevConflicts.current = keys
    const hit = fresh.find((c) => c.tableId)
    if (!hit) return
    const t = s.tables.find((t) => t.id === hit.tableId)
    const el = ref.current
    // pan after the view transition finishes — a running transition cancels smooth scroll
    const panTimer = setTimeout(() => {
      if (t && el) {
        panTo(el, t.x * zoom - el.clientWidth / 2, t.y * zoom - el.clientHeight / 2)
      }
      setShakeId(hit.tableId!)
      sound.conflict()
    }, 640)
    const timer = setTimeout(() => setShakeId(null), 1900)
    return () => {
      clearTimeout(timer)
      clearTimeout(panTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.guests, s.constraints, s.groupRules])

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
      if (s.tables.length > 0) setTimeout(() => fit(), 30)
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
    setTimeout(() => {
      el.scrollLeft = minX * z
      el.scrollTop = minY * z
    }, 40)
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
        className={`board-inner ${zoom < 0.8 ? 'compact' : ''}`}
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: extent.w, height: extent.h }}
      >
      {s.tables.map((t, i) => (
        <TableView
          key={t.id}
          table={t}
          index={i}
          zoom={zoom}
          shaking={shakeId === t.id}
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
          <p className="empty-sub">You make the calls. Your agent does the labor — live, on this board.</p>
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
    {(s.tables.length > 0 || s.guests.length > 0) && (
      <div className="zoom-controls">
        <button
          className="btn add-table"
          title="Add a table to the floor plan"
          onClick={() => {
            const el = ref.current
            const x = el ? (el.scrollLeft + el.clientWidth / 2) / zoom : 500
            const y = el ? (el.scrollTop + el.clientHeight / 2) / zoom : 350
            const id = uid('t')
            const label = `${vocab(s).container} ${s.tables.length + 1}`
            update(
              (st) => ({
                ...st,
                tables: [...st.tables, { id, label, shape: 'round' as const, capacity: 8, x, y }],
                selection: { type: 'table', id },
              }),
              { actor: 'human', describe: `added ${label}` }
            )
            announce(`${label} added — drag it anywhere, edit it in the panel below.`)
          }}
        >
          <IcPlus /> {vocab(s).container}
        </button>
        <button className="btn icon-btn" title="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}><IcPlus /></button>
        <button className="btn icon-btn" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}><IcMinus /></button>
        <button className="btn icon-btn" title="Fit the whole room in view" onClick={fit}><IcFit /></button>
      </div>
    )}
    <TableInspector />
    <ConflictDock />
    <ProposalBanner />
    </div>
  )
}

function TableInspector() {
  const s = useApp()
  const t = s.selection?.type === 'table' ? s.tables.find((x) => x.id === s.selection!.id) : null
  if (!t) return null
  const patch = (p: Partial<Table>, describe?: string) =>
    update(
      (st) => ({ ...st, tables: st.tables.map((x) => (x.id === t.id ? { ...x, ...p } : x)) }),
      describe ? { actor: 'human', describe } : { undoable: false }
    )
  return (
    <div className="inspector">
      <input
        className="insp-label"
        value={t.label}
        onChange={(e) => patch({ label: e.target.value })}
        title="Rename this table"
      />
      <span className="insp-group">
        <button
          className="btn icon-btn"
          title="Fewer seats"
          onClick={() => patch({ capacity: Math.max(1, t.capacity - 1) }, `set ${t.label} to ${Math.max(1, t.capacity - 1)} seats`)}
        >
          <IcMinus />
        </button>
        <span className="insp-cap">{t.capacity} seats</span>
        <button
          className="btn icon-btn"
          title="More seats"
          onClick={() => patch({ capacity: Math.min(16, t.capacity + 1) }, `set ${t.label} to ${Math.min(16, t.capacity + 1)} seats`)}
        >
          <IcPlus />
        </button>
      </span>
      <button
        className={`btn insp-access ${t.accessible ? 'on' : ''}`}
        title="Toggle wheelchair-accessible"
        onClick={() => patch({ accessible: !t.accessible }, `${t.accessible ? 'unmarked' : 'marked'} ${t.label} as accessible`)}
      >
        ♿
      </button>
      <button
        className="btn insp-del"
        title="Remove this table (guests return to the pool)"
        onClick={() => {
          if (!confirm(`Remove ${t.label}? Anyone seated there goes back to the pool.`)) return
          const displaced = guestsAt(s, t.id).length
          update(
            (st) => ({
              ...st,
              tables: st.tables.filter((x) => x.id !== t.id),
              guests: st.guests.map((g) => (g.tableId === t.id ? { ...g, tableId: null, pinned: false } : g)),
              selection: null,
            }),
            { actor: 'human', describe: `removed ${t.label}${displaced ? ` (${displaced} back to the pool)` : ''}` }
          )
          announce(`${t.label} removed${displaced ? ` — ${displaced} guest${displaced === 1 ? '' : 's'} back in the pool.` : '.'}`)
        }}
      >
        <IcClose /> Remove
      </button>
    </div>
  )
}

function ProposalBanner() {
  const s = useApp()
  const [openList, setOpenList] = useState(false)
  if (!s.proposal) return null
  const p = s.proposal
  const tname = (id: string | null) => (id ? s.tables.find((t) => t.id === id)?.label ?? '?' : 'unassigned')
  const tablesTouched = new Set(p.moves.flatMap((m) => [m.from, m.to]).filter(Boolean)).size
  return (
    <div className="proposal">
      <div className="proposal-head">
        <span className="proposal-mark">✳</span>
        <span className="proposal-kicker">Agent proposal</span>
        <span className="proposal-meta">
          {p.moves.length} move{p.moves.length === 1 ? '' : 's'} · {tablesTouched} table{tablesTouched === 1 ? '' : 's'} · reversible
        </span>
      </div>
      <div className="proposal-row">
        <div className="proposal-text">
          <span className="proposal-note">{p.note}</span>
        </div>
        <button className="btn" onClick={() => setOpenList(!openList)}>
          {openList ? 'Hide' : 'Review'}
        </button>
        <button className="btn" onClick={() => dismissProposal('human')}>Dismiss</button>
        <button className="btn primary" onClick={() => { sound.success(); applyProposal('human') }}>Accept</button>
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
  zoom,
  shaking,
  selected,
  onGrab,
}: {
  table: Table
  index: number
  zoom: number
  shaking: boolean
  selected: boolean
  onGrab: (e: React.PointerEvent) => void
}) {
  // the conflict note tag is draggable — park it wherever it doesn't bother you
  const [tagPos, setTagPos] = useState({ x: 62, y: -96 })
  const tagDrag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
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
      className={`table round ${selected ? 'selected' : ''} ${cfHere ? 'has-conflict' : ''} ${shaking ? 'shake' : ''}`}
      style={{ left: table.x, top: table.y, animationDelay: `${Math.min(index * 26, 340)}ms` }}
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
        <div
          className="conflict-tag"
          style={{ left: tagPos.x - 13, top: tagPos.y - 13 }}
          title="Drag me anywhere"
          onPointerDown={(e) => {
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            tagDrag.current = { px: e.clientX, py: e.clientY, ox: tagPos.x, oy: tagPos.y }
          }}
          onPointerMove={(e) => {
            const d = tagDrag.current
            if (!d) return
            setTagPos({ x: d.ox + (e.clientX - d.px) / zoom, y: d.oy + (e.clientY - d.py) / zoom })
          }}
          onPointerUp={() => (tagDrag.current = null)}
        >
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
            title={[
              seat.guest.name,
              seat.guest.group,
              seat.guest.diet !== 'none' ? `${DIET_ICON[seat.guest.diet] ?? ''} ${seat.guest.diet}` : null,
              seat.guest.accessibility ? '♿ needs accessible seating' : null,
              ...relationNotes(s, seat.guest.id),
              seat.guest.pinned ? '📌 pinned — double-click to unpin' : 'double-click to pin',
            ].filter(Boolean).join('\n')}
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.setData('text/guest-id', seat.guest!.id)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              sound.tick()
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
            {seat.guest.pinned && <span className="seat-badge pin"><IcPin /></span>}
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
