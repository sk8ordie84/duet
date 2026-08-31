// Core data model for Duet — a seating planner humans and agents build together.

import { flushSync } from 'react-dom'

/**
 * Run a state change inside a View Transition so seat moves morph across the
 * board instead of teleporting. Falls back to a plain call where unsupported.
 */
export function animated(fn: () => void): Promise<void> {
  const d = document as unknown as {
    startViewTransition?: (cb: () => void) => {
      finished?: Promise<void>
      ready?: Promise<void>
      updateCallbackDone?: Promise<void>
    }
  }
  if (d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // The callback runs async (after the old-state snapshot). Callers that read
    // state afterwards MUST await the returned promise. Rapid successive
    // transitions abort their predecessors — fine, just don't let it throw.
    const t = d.startViewTransition(() => flushSync(fn))
    t.finished?.catch(() => {})
    t.ready?.catch(() => {})
    return (t.updateCallbackDone ?? Promise.resolve()).catch(() => {})
  }
  fn()
  return Promise.resolve()
}

export type Diet = 'none' | 'vegetarian' | 'vegan' | 'gluten-free' | 'halal' | 'kosher'

export interface Guest {
  id: string
  name: string
  group?: string // e.g. "bride's family", "college friends"
  diet: Diet
  accessibility?: boolean // needs accessible seating
  tableId: string | null // null = unassigned pool
  pinned?: boolean // placed by the human — solver and agent must not move them
}

export type ConstraintKind = 'together' | 'apart'

/**
 * Per-group placement policy.
 * 'cluster' (default behavior even without a rule): the solver likes keeping the group together.
 * 'spread': mix the group across tables — at most maxPerTable (default 2) share a table.
 * Useful for networking dinners (mix companies), hosts (one per table), or chatty kids.
 */
export interface GroupRule {
  group: string
  mode: 'cluster' | 'spread'
  maxPerTable?: number
}

export interface Constraint {
  id: string
  kind: ConstraintKind
  a: string // guest id
  b: string // guest id
  note?: string
}

export type TableShape = 'round' | 'rect'

export interface Table {
  id: string
  label: string
  shape: TableShape
  capacity: number
  x: number // board coordinates
  y: number
  accessible?: boolean
}

export interface Conflict {
  constraintId?: string
  tableId?: string
  guestIds: string[]
  message: string
  severity: 'error' | 'warn'
}

export interface Vocab {
  person: string // "Guest" | "Employee" | "Student"
  people: string
  container: string // "Table" | "Zone" | "Group"
  containers: string
}

export interface EventInfo {
  name: string
  date?: string
  template?: string
  vocab?: Vocab
}

export const DEFAULT_VOCAB: Vocab = { person: 'Guest', people: 'Guests', container: 'Table', containers: 'Tables' }

export interface ProposedMove {
  guestId: string
  from: string | null // tableId
  to: string | null
}

export interface Proposal {
  moves: ProposedMove[]
  note: string
  createdAt: number
}

export interface Actor {
  kind: 'human' | 'agent'
}

export interface LogEntry {
  id: string
  actor: 'human' | 'agent'
  text: string
  at: number
}

export interface AppState {
  event: EventInfo
  guests: Guest[]
  tables: Table[]
  constraints: Constraint[]
  groupRules: GroupRule[]
  proposal: Proposal | null
  selection: { type: 'table'; id: string } | { type: 'guest'; id: string } | null
  log: LogEntry[]
  // transient agent presence: where the agent "cursor" is acting
  agentFocus: { x: number; y: number; label: string; ts: number } | null
}

let nextId = 1
export const uid = (p: string) => `${p}${nextId++}`

// ---------- store ----------

type Listener = () => void

const listeners = new Set<Listener>()

const BLANK: AppState = {
  event: { name: 'Untitled event', vocab: DEFAULT_VOCAB },
  guests: [],
  tables: [],
  constraints: [],
  groupRules: [],
  proposal: null,
  selection: null,
  log: [],
  agentFocus: null,
}

const STORAGE_KEY = 'duet-plan-v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return BLANK
    const saved = JSON.parse(raw)
    // rebase the id counter above any persisted ids
    const ids = [...(saved.guests ?? []), ...(saved.tables ?? []), ...(saved.constraints ?? []), ...(saved.log ?? [])]
      .map((x: { id: string }) => parseInt(x.id.replace(/^\D+/, ''), 10))
      .filter((n: number) => !isNaN(n))
    if (ids.length) nextId = Math.max(...ids) + 1
    return { ...BLANK, ...saved, selection: null, agentFocus: null, log: saved.log ?? [] }
  } catch {
    return BLANK
  }
}

function persist(s: AppState) {
  try {
    const { selection, agentFocus, ...rest } = s
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // storage unavailable (private mode etc.) — app still works in-memory
  }
}

let state: AppState = load()

const undoStack: AppState[] = []
const redoStack: AppState[] = []
const MAX_UNDO = 100

export function getState(): AppState {
  return state
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) fn()
}

/** Mutate state. Pass actor + description to record in the activity log and undo stack. */
export function update(
  mutator: (s: AppState) => AppState,
  opts?: { actor?: 'human' | 'agent'; describe?: string; undoable?: boolean }
) {
  if (opts?.undoable !== false) {
    undoStack.push(state)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
  }
  state = mutator(state)
  if (opts?.describe) {
    state = {
      ...state,
      log: [
        { id: uid('log'), actor: opts.actor ?? 'human', text: opts.describe, at: Date.now() },
        ...state.log,
      ].slice(0, 200),
    }
  }
  persist(state)
  emit()
}

export function undo(): boolean {
  const prev = undoStack.pop()
  if (!prev) return false
  redoStack.push(state)
  state = { ...prev, log: state.log, agentFocus: null }
  persist(state)
  emit()
  return true
}

export function redo(): boolean {
  const next = redoStack.pop()
  if (!next) return false
  undoStack.push(state)
  state = { ...next, log: state.log, agentFocus: null }
  persist(state)
  emit()
  return true
}

export function setAgentFocus(focus: AppState['agentFocus']) {
  state = { ...state, agentFocus: focus }
  emit()
}

// ---------- derived helpers ----------

export function guestsAt(s: AppState, tableId: string): Guest[] {
  return s.guests.filter((g) => g.tableId === tableId)
}

export function findGuestByName(s: AppState, name: string): Guest | undefined {
  const n = name.trim().toLowerCase()
  return (
    s.guests.find((g) => g.name.toLowerCase() === n) ??
    s.guests.find((g) => g.name.toLowerCase().includes(n))
  )
}

export function findTable(s: AppState, ref: string): Table | undefined {
  const n = ref.trim().toLowerCase()
  return (
    s.tables.find((t) => t.id === ref) ??
    s.tables.find((t) => t.label.toLowerCase() === n) ??
    s.tables.find((t) => t.label.toLowerCase().includes(n))
  )
}

export function conflicts(s: AppState): Conflict[] {
  const out: Conflict[] = []
  const tableOf = new Map(s.guests.map((g) => [g.id, g.tableId]))
  for (const c of s.constraints) {
    const ta = tableOf.get(c.a)
    const tb = tableOf.get(c.b)
    if (ta == null || tb == null) continue
    const ga = s.guests.find((g) => g.id === c.a)!
    const gb = s.guests.find((g) => g.id === c.b)!
    if (c.kind === 'apart' && ta === tb) {
      out.push({
        constraintId: c.id,
        tableId: ta,
        guestIds: [c.a, c.b],
        message: `${ga.name} × ${gb.name} must be kept apart${c.note ? ` — ${c.note}` : ''}`,
        severity: 'error',
      })
    }
    if (c.kind === 'together' && ta !== tb) {
      out.push({
        constraintId: c.id,
        tableId: ta,
        guestIds: [c.a, c.b],
        message: `${ga.name} should sit with ${gb.name}${c.note ? ` — ${c.note}` : ''}`,
        severity: 'warn',
      })
    }
  }
  for (const rule of s.groupRules) {
    if (rule.mode !== 'cluster') continue
    const seatedMembers = s.guests.filter((g) => g.group === rule.group && g.tableId != null)
    const tablesUsed = [...new Set(seatedMembers.map((g) => g.tableId))]
    if (tablesUsed.length > 1) {
      out.push({
        guestIds: seatedMembers.map((g) => g.id),
        message: `"${rule.group}" is split across ${tablesUsed.length} tables (rule: keep together)`,
        severity: 'warn',
      })
    }
  }
  for (const t of s.tables) {
    const seated = guestsAt(s, t.id)
    if (seated.length > t.capacity) {
      out.push({
        tableId: t.id,
        guestIds: seated.map((g) => g.id),
        message: `${t.label} is over capacity (${seated.length}/${t.capacity})`,
        severity: 'error',
      })
    }
    for (const rule of s.groupRules) {
      if (rule.mode !== 'spread') continue
      const max = rule.maxPerTable ?? 2
      const members = seated.filter((g) => g.group === rule.group)
      if (members.length > max) {
        out.push({
          tableId: t.id,
          guestIds: members.map((g) => g.id),
          message: `${members.length} from "${rule.group}" share ${t.label} (mixing rule: max ${max} per table)`,
          severity: 'warn',
        })
      }
    }
    const needsAccess = seated.filter((g) => g.accessibility)
    if (needsAccess.length > 0 && !t.accessible) {
      out.push({
        tableId: t.id,
        guestIds: needsAccess.map((g) => g.id),
        message: `${needsAccess.map((g) => g.name).join(', ')} ${needsAccess.length === 1 ? 'needs' : 'need'} accessible seating but ${t.label} is not marked accessible`,
        severity: 'warn',
      })
    }
  }
  return out
}

export function vocab(s: AppState): Vocab {
  return s.event.vocab ?? DEFAULT_VOCAB
}

/** Apply a pending proposal. actor records who confirmed it. */
export function applyProposal(actor: 'human' | 'agent') {
  const s = getState()
  if (!s.proposal) return false
  // pins are law even against an older proposal: skip guests pinned since it was made
  const pinnedNow = new Set(s.guests.filter((g) => g.pinned).map((g) => g.id))
  const moves = s.proposal.moves.filter((m) => !pinnedNow.has(m.guestId))
  const skipped = s.proposal.moves.length - moves.length
  animated(() =>
    update(
      (st) => ({
        ...st,
        guests: st.guests.map((g) => {
          const m = moves.find((m) => m.guestId === g.id)
          return m ? { ...g, tableId: m.to } : g
        }),
        proposal: null,
      }),
      {
        actor,
        describe: `${actor === 'human' ? 'accepted' : 'applied'} the proposal (${moves.length} moves${skipped ? `, ${skipped} skipped — pinned 📌` : ''})`,
      }
    )
  )
  return true
}

export function dismissProposal(actor: 'human' | 'agent') {
  const s = getState()
  if (!s.proposal) return false
  update((st) => ({ ...st, proposal: null }), {
    actor,
    describe: actor === 'human' ? 'dismissed the proposal' : 'withdrew the proposal',
  })
  return true
}

export function dietSummary(s: AppState): Record<string, number> {
  const sum: Record<string, number> = {}
  for (const g of s.guests) sum[g.diet] = (sum[g.diet] ?? 0) + 1
  return sum
}
