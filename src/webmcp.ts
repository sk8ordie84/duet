// WebMCP integration. Registers a base toolset for the whole plan, plus a
// dynamic, selection-scoped toolset that appears/disappears as the human
// selects tables — the agent's available tools literally follow the human's focus.

import {
  getState,
  update,
  undo,
  setAgentFocus,
  findGuestByName,
  findTable,
  guestsAt,
  conflicts,
  dietSummary,
  uid,
  type Diet,
  type AppState,
} from './model'
import { solve } from './solver'

type ToolDef = {
  name: string
  description: string
  inputSchema: object
  execute: (input: any, ctx?: { signal?: AbortSignal }) => Promise<string> | string
  annotations?: { readOnlyHint?: boolean }
}

interface ModelContext {
  registerTool(tool: ToolDef, options?: { signal?: AbortSignal }): void | Promise<void>
}

// Dev/test shim: when the browser has no WebMCP, expose the same registry on
// window.__webmcp so the toolchain can be exercised from the console:
//   __webmcp.list()  /  __webmcp.call('seat_guest', { guest: 'Mia', table: 'Table 1' })
function shim(): ModelContext {
  const w = window as any
  if (w.__webmcp) return w.__webmcp.ctx
  const tools = new Map<string, ToolDef>()
  const ctx: ModelContext = {
    registerTool(tool: ToolDef, options?: { signal?: AbortSignal }) {
      tools.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
    },
  }
  w.__webmcp = {
    ctx,
    list: () => [...tools.keys()],
    call: async (name: string, input: any = {}) => {
      const t = tools.get(name)
      if (!t) throw new Error(`no tool ${name}; have: ${[...tools.keys()].join(', ')}`)
      return await t.execute(input, {})
    },
  }
  return ctx
}

function mc(): ModelContext | null {
  const d = document as any
  const n = navigator as any
  return d.modelContext ?? n.modelContext ?? shim()
}

export function webmcpAvailable(): boolean {
  const d = document as any
  const n = navigator as any
  return (d.modelContext ?? n.modelContext) != null
}

// ---- agent presence -------------------------------------------------------

let focusTimer: ReturnType<typeof setTimeout> | null = null

/** Flash the agent cursor near a table (board coords) with an action label. */
function agentActsAt(x: number, y: number, label: string) {
  setAgentFocus({ x, y, label, ts: Date.now() })
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = setTimeout(() => setAgentFocus(null), 2600)
}

function agentActsAtTable(tableId: string | null, label: string) {
  const s = getState()
  const t = s.tables.find((t) => t.id === tableId)
  if (t) agentActsAt(t.x, t.y, label)
  else agentActsAt(140, 80, label) // guest pool area
}

// ---- helpers --------------------------------------------------------------

const DIETS: Diet[] = ['none', 'vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher']

function planSummary(s: AppState) {
  return {
    event: s.event,
    tables: s.tables.map((t) => ({
      id: t.id,
      label: t.label,
      shape: t.shape,
      capacity: t.capacity,
      accessible: !!t.accessible,
      seated: guestsAt(s, t.id).map((g) => g.name),
    })),
    unassigned: s.guests.filter((g) => g.tableId == null).map((g) => g.name),
    guests: s.guests.map((g) => ({
      name: g.name,
      group: g.group ?? null,
      diet: g.diet,
      accessibility: !!g.accessibility,
      table: s.tables.find((t) => t.id === g.tableId)?.label ?? null,
    })),
    constraints: s.constraints.map((c) => ({
      kind: c.kind,
      a: s.guests.find((g) => g.id === c.a)?.name,
      b: s.guests.find((g) => g.id === c.b)?.name,
      note: c.note ?? null,
    })),
    conflicts: conflicts(s).map((c) => c.message),
  }
}

const j = (v: unknown) => JSON.stringify(v, null, 2)

// ---- base tools -----------------------------------------------------------

let baseRegistered = false

export function registerBaseTools() {
  const ctx = mc()
  if (!ctx || baseRegistered) return
  baseRegistered = true

  const tools: ToolDef[] = [
    {
      name: 'get_seating_plan',
      description:
        'Get the full current state of the seating plan: event info, tables with who is seated, unassigned guests, all guests with dietary/accessibility needs, constraints, and current conflicts. Call this first to understand the plan.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => j(planSummary(getState())),
    },
    {
      name: 'add_guests',
      description:
        'Add one or more guests to the guest list (they start unassigned). Accepts name, optional group (e.g. "bride family", "college friends"), diet, and accessibility flag for guests needing wheelchair-accessible seating.',
      inputSchema: {
        type: 'object',
        properties: {
          guests: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                group: { type: 'string' },
                diet: { type: 'string', enum: DIETS },
                accessibility: { type: 'boolean' },
              },
              required: ['name'],
            },
          },
        },
        required: ['guests'],
      },
      execute: (input: { guests: { name: string; group?: string; diet?: string; accessibility?: boolean }[] }) => {
        const added: string[] = []
        update(
          (s) => {
            const gs = [...s.guests]
            for (const g of input.guests) {
              if (!g.name?.trim()) continue
              gs.push({
                id: uid('g'),
                name: g.name.trim(),
                group: g.group?.trim() || undefined,
                diet: (DIETS.includes(g.diet as Diet) ? g.diet : 'none') as Diet,
                accessibility: !!g.accessibility,
                tableId: null,
              })
              added.push(g.name.trim())
            }
            return { ...s, guests: gs }
          },
          { actor: 'agent', describe: `added ${added.length} guest${added.length === 1 ? '' : 's'}: ${added.join(', ')}` }
        )
        agentActsAtTable(null, `+${added.length} guests`)
        return j({ added, total_guests: getState().guests.length })
      },
    },
    {
      name: 'add_table',
      description: 'Add a table to the floor plan. Shape is "round" or "rect". Mark accessible:true if it can host wheelchair users.',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          capacity: { type: 'number' },
          shape: { type: 'string', enum: ['round', 'rect'] },
          accessible: { type: 'boolean' },
        },
        required: ['label', 'capacity'],
      },
      execute: (input: { label: string; capacity: number; shape?: 'round' | 'rect'; accessible?: boolean }) => {
        const s0 = getState()
        const i = s0.tables.length
        const x = 280 + (i % 3) * 320
        const y = 220 + Math.floor(i / 3) * 300
        const id = uid('t')
        update(
          (s) => ({
            ...s,
            tables: [
              ...s.tables,
              {
                id,
                label: input.label,
                capacity: Math.max(1, Math.round(input.capacity)),
                shape: input.shape ?? 'round',
                accessible: !!input.accessible,
                x,
                y,
              },
            ],
          }),
          { actor: 'agent', describe: `added table "${input.label}" (${input.capacity} seats)` }
        )
        agentActsAt(x, y, `+ ${input.label}`)
        return j({ ok: true, table_id: id })
      },
    },
    {
      name: 'seat_guest',
      description:
        'Seat a guest at a table (or move them there). Reference the guest by name and the table by label. Reports any conflicts this creates.',
      inputSchema: {
        type: 'object',
        properties: { guest: { type: 'string' }, table: { type: 'string' } },
        required: ['guest', 'table'],
      },
      execute: (input: { guest: string; table: string }) => {
        const s = getState()
        const g = findGuestByName(s, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        const t = findTable(s, input.table)
        if (!t) return j({ error: `No table matching "${input.table}"` })
        update(
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, tableId: t.id } : x)) }),
          { actor: 'agent', describe: `seated ${g.name} at ${t.label}` }
        )
        agentActsAt(t.x, t.y, `${g.name} → ${t.label}`)
        const cf = conflicts(getState()).filter((c) => c.guestIds.includes(g.id))
        return j({ ok: true, seated: g.name, at: t.label, new_conflicts: cf.map((c) => c.message) })
      },
    },
    {
      name: 'unseat_guest',
      description: 'Remove a guest from their table back to the unassigned pool.',
      inputSchema: { type: 'object', properties: { guest: { type: 'string' } }, required: ['guest'] },
      execute: (input: { guest: string }) => {
        const s = getState()
        const g = findGuestByName(s, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        update(
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, tableId: null } : x)) }),
          { actor: 'agent', describe: `unseated ${g.name}` }
        )
        agentActsAtTable(null, `${g.name} → pool`)
        return j({ ok: true })
      },
    },
    {
      name: 'add_constraint',
      description:
        'Record a relationship constraint between two guests: kind "together" (should share a table) or "apart" (must NOT share a table, e.g. divorced, feuding). The solver and conflict checker honor these.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['together', 'apart'] },
          guest_a: { type: 'string' },
          guest_b: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['kind', 'guest_a', 'guest_b'],
      },
      execute: (input: { kind: 'together' | 'apart'; guest_a: string; guest_b: string; note?: string }) => {
        const s = getState()
        const a = findGuestByName(s, input.guest_a)
        const b = findGuestByName(s, input.guest_b)
        if (!a || !b) return j({ error: `Guest not found: ${!a ? input.guest_a : input.guest_b}` })
        update(
          (st) => ({
            ...st,
            constraints: [...st.constraints, { id: uid('c'), kind: input.kind, a: a.id, b: b.id, note: input.note }],
          }),
          { actor: 'agent', describe: `constraint: ${a.name} & ${b.name} ${input.kind}${input.note ? ` (${input.note})` : ''}` }
        )
        agentActsAtTable(a.tableId, `${input.kind}: ${a.name}·${b.name}`)
        return j({ ok: true, violated_now: conflicts(getState()).map((c) => c.message) })
      },
    },
    {
      name: 'auto_arrange',
      description:
        'Run the constraint solver to (re)arrange guests across tables: honors together/apart constraints, capacities, group affinity, and accessibility. By default it respects seats the human placed by hand this session unless respect_current is false. Returns the number of moves and remaining conflicts.',
      inputSchema: {
        type: 'object',
        properties: {
          respect_current: {
            type: 'boolean',
            description: 'If true (default false), currently seated guests stay put and only unassigned guests are placed.',
          },
        },
      },
      execute: (input: { respect_current?: boolean }) => {
        const s = getState()
        if (s.tables.length === 0) return j({ error: 'No tables yet — add tables first.' })
        const locked = input.respect_current
          ? new Set(s.guests.filter((g) => g.tableId != null).map((g) => g.id))
          : new Set<string>()
        const { seats, moves } = solve(s, { locked })
        update(
          (st) => ({ ...st, guests: st.guests.map((g) => ({ ...g, tableId: seats.get(g.id) ?? null })) }),
          { actor: 'agent', describe: `auto-arranged the room (${moves} moves)` }
        )
        const mid = getState().tables.reduce((acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }), { x: 0, y: 0 })
        const n = getState().tables.length
        agentActsAt(mid.x / n, mid.y / n, `auto-arrange · ${moves} moves`)
        const cf = conflicts(getState())
        return j({
          ok: true,
          moves,
          remaining_conflicts: cf.map((c) => c.message),
          plan: planSummary(getState()).tables,
        })
      },
    },
    {
      name: 'get_conflicts',
      description: 'List all current conflicts: violated apart/together constraints, over-capacity tables, and accessibility mismatches.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => j(conflicts(getState()).map((c) => ({ severity: c.severity, message: c.message }))),
    },
    {
      name: 'dietary_report',
      description: 'Summarize dietary needs across all guests, and per table — useful for the caterer.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = getState()
        return j({
          totals: dietSummary(s),
          per_table: s.tables.map((t) => ({
            table: t.label,
            diets: guestsAt(s, t.id).reduce<Record<string, number>>((acc, g) => {
              acc[g.diet] = (acc[g.diet] ?? 0) + 1
              return acc
            }, {}),
          })),
        })
      },
    },
    {
      name: 'undo_last_change',
      description: 'Undo the most recent change to the plan (works for both human and agent actions).',
      inputSchema: { type: 'object', properties: {} },
      execute: () => j({ ok: undo() }),
    },
  ]

  for (const t of tools) ctx.registerTool(t)
}

// ---- dynamic selection-scoped tools --------------------------------------

let selectionController: AbortController | null = null
let lastSelectedTable: string | null = null

/** Call whenever selection changes: swaps in table-scoped tools via AbortSignal. */
export function syncSelectionTools() {
  const ctx = mc()
  if (!ctx) return
  const s = getState()
  const sel = s.selection?.type === 'table' ? s.selection.id : null
  if (sel === lastSelectedTable) return
  lastSelectedTable = sel

  selectionController?.abort()
  selectionController = null
  if (!sel) return

  const table = s.tables.find((t) => t.id === sel)
  if (!table) return
  selectionController = new AbortController()
  const signal = selectionController.signal

  const scoped: ToolDef[] = [
    {
      name: 'selected_table_info',
      description: `The human has currently selected table "${table.label}". Get who sits here, capacity, and conflicts involving this table.`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const st = getState()
        const t = st.tables.find((t) => t.id === sel)!
        return j({
          table: t.label,
          capacity: t.capacity,
          accessible: !!t.accessible,
          seated: guestsAt(st, t.id).map((g) => ({ name: g.name, group: g.group, diet: g.diet })),
          conflicts: conflicts(st)
            .filter((c) => c.tableId === t.id)
            .map((c) => c.message),
        })
      },
    },
    {
      name: 'seat_at_selected_table',
      description: `Seat a guest (by name) at the table the human is currently looking at ("${table.label}").`,
      inputSchema: { type: 'object', properties: { guest: { type: 'string' } }, required: ['guest'] },
      execute: (input: { guest: string }) => {
        const st = getState()
        const g = findGuestByName(st, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        update(
          (x) => ({ ...x, guests: x.guests.map((gg) => (gg.id === g.id ? { ...gg, tableId: sel } : gg)) }),
          { actor: 'agent', describe: `seated ${g.name} at ${table.label} (selected)` }
        )
        agentActsAt(table.x, table.y, `${g.name} → here`)
        return j({ ok: true })
      },
    },
    {
      name: 'clear_selected_table',
      description: `Move everyone at the selected table ("${table.label}") back to the unassigned pool.`,
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        update(
          (x) => ({ ...x, guests: x.guests.map((g) => (g.tableId === sel ? { ...g, tableId: null } : g)) }),
          { actor: 'agent', describe: `cleared ${table.label}` }
        )
        agentActsAt(table.x, table.y, 'cleared')
        return j({ ok: true })
      },
    },
    {
      name: 'set_selected_table_properties',
      description: `Change capacity, label, or accessibility of the selected table ("${table.label}").`,
      inputSchema: {
        type: 'object',
        properties: {
          capacity: { type: 'number' },
          label: { type: 'string' },
          accessible: { type: 'boolean' },
        },
      },
      execute: (input: { capacity?: number; label?: string; accessible?: boolean }) => {
        update(
          (x) => ({
            ...x,
            tables: x.tables.map((t) =>
              t.id === sel
                ? {
                    ...t,
                    capacity: input.capacity != null ? Math.max(1, Math.round(input.capacity)) : t.capacity,
                    label: input.label ?? t.label,
                    accessible: input.accessible ?? t.accessible,
                  }
                : t
            ),
          }),
          { actor: 'agent', describe: `updated ${table.label}` }
        )
        agentActsAt(table.x, table.y, 'updated')
        return j({ ok: true })
      },
    },
  ]

  for (const t of scoped) ctx.registerTool(t, { signal })
}
