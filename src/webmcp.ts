// WebMCP integration. Registers a base toolset for the whole plan, plus a
// dynamic, selection-scoped toolset that appears/disappears as the human
// selects tables — the agent's available tools literally follow the human's focus.

import {
  getState,
  update,
  animated,
  undo,
  setAgentFocus,
  findGuestByName,
  findTable,
  guestsAt,
  conflicts,
  dietSummary,
  applyProposal,
  dismissProposal,
  uid,
  type Diet,
  type AppState,
  type ProposedMove,
} from './model'
import { solve } from './solver'
import { TEMPLATES, loadTemplate } from './templates'

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

// The underlying API is document.modelContext.registerTool({ name, description,
// inputSchema, execute }) — mc() resolves it, falling back to navigator.modelContext
// (earlier drafts of the spec) or, in browsers without WebMCP, to the console shim above.
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

function agentActsAtCenter(label: string) {
  const s = getState()
  if (s.tables.length === 0) return agentActsAt(400, 300, label)
  const mid = s.tables.reduce((acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }), { x: 0, y: 0 })
  agentActsAt(mid.x / s.tables.length, mid.y / s.tables.length, label)
}

// ---- helpers --------------------------------------------------------------

const DIETS: Diet[] = ['none', 'vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher']

/** Run the solver with human pins always locked. */
export function computeArrangement(respectCurrent: boolean) {
  const s = getState()
  const locked = new Set(
    s.guests.filter((g) => g.pinned || (respectCurrent && g.tableId != null)).map((g) => g.id)
  )
  const { seats, moves } = solve(s, { locked, iterations: Math.max(4000, s.guests.length * 120) })
  const movesList: ProposedMove[] = s.guests
    .filter((g) => (seats.get(g.id) ?? null) !== g.tableId)
    .map((g) => ({ guestId: g.id, from: g.tableId, to: seats.get(g.id) ?? null }))
  // conflicts if this arrangement were applied
  const hypothetical: AppState = {
    ...s,
    guests: s.guests.map((g) => ({ ...g, tableId: seats.get(g.id) ?? null })),
  }
  const remaining = conflicts(hypothetical).map((c) => c.message)
  return { seats, moves, movesList, remaining }
}

/** Explain WHY a guest sits where they sit — the solver's reasoning, reconstructed. */
function explainGuest(s: AppState, g: (typeof s.guests)[number]): string[] {
  const reasons: string[] = []
  const t = s.tables.find((t) => t.id === g.tableId)
  if (g.pinned) reasons.push('placed and pinned by the human 📌 — the solver plans around them')
  if (!t) {
    reasons.push('currently unseated (in the pool)')
    return reasons
  }
  const tableOf = (id: string) => s.tables.find((x) => x.id === s.guests.find((gg) => gg.id === id)?.tableId)
  for (const c of s.constraints) {
    if (c.a !== g.id && c.b !== g.id) continue
    const otherId = c.a === g.id ? c.b : c.a
    const other = s.guests.find((gg) => gg.id === otherId)
    if (!other) continue
    const same = other.tableId === g.tableId
    const note = c.note ? ` (${c.note})` : ''
    if (c.kind === 'together') {
      reasons.push(
        same
          ? `sits with ${other.name} — "together" request satisfied${note}`
          : `"together" with ${other.name} NOT satisfied — they are at ${tableOf(otherId)?.label ?? 'the pool'}${note}`
      )
    } else {
      reasons.push(
        same
          ? `⚠ VIOLATES the keep-apart rule with ${other.name}${note}`
          : `kept away from ${other.name}${note}`
      )
    }
  }
  if (g.group) {
    const mates = s.guests.filter((x) => x.id !== g.id && x.group === g.group && x.tableId === g.tableId).length
    const rule = s.groupRules.find((r) => r.group === g.group)
    if (rule?.mode === 'spread') {
      reasons.push(`"${g.group}" is spread for mixing (max ${rule.maxPerTable ?? 2}/table) — ${mates + 1} here`)
    } else if (mates > 0) {
      reasons.push(`seated with ${mates} other${mates === 1 ? '' : 's'} from "${g.group}"${rule?.mode === 'cluster' ? ' (keep-together rule)' : ''}`)
    }
  }
  if (g.accessibility) {
    reasons.push(t.accessible ? `${t.label} is accessible ♿ as they need` : `⚠ needs accessible seating but ${t.label} is not accessible`)
  }
  reasons.push(`${t.label} is at ${guestsAt(s, t.id).length}/${t.capacity} capacity`)
  return reasons
}

function describeMoves(moves: ProposedMove[]): string[] {
  const s = getState()
  const tname = (id: string | null) => (id ? s.tables.find((t) => t.id === id)?.label ?? '?' : 'unassigned')
  return moves.map((m) => {
    const g = s.guests.find((g) => g.id === m.guestId)
    return `${g?.name ?? '?'}: ${tname(m.from)} → ${tname(m.to)}`
  })
}

export function exportMarkdown(s: AppState): string {
  const lines: string[] = [`# ${s.event.name}`, '']
  for (const t of s.tables) {
    const seated = guestsAt(s, t.id)
    lines.push(`## ${t.label} (${seated.length}/${t.capacity})${t.accessible ? ' ♿' : ''}`)
    for (const g of seated) {
      const tags = [g.group, g.diet !== 'none' ? g.diet : null, g.accessibility ? 'accessible seating' : null, g.pinned ? 'pinned' : null]
        .filter(Boolean)
        .join(', ')
      lines.push(`- ${g.name}${tags ? ` _(${tags})_` : ''}`)
    }
    lines.push('')
  }
  const un = s.guests.filter((g) => g.tableId == null)
  if (un.length) {
    lines.push(`## Unassigned (${un.length})`)
    for (const g of un) lines.push(`- ${g.name}`)
    lines.push('')
  }
  lines.push('## Catering brief')
  for (const [diet, n] of Object.entries(dietSummary(s))) if (diet !== 'none') lines.push(`- ${diet}: ${n}`)
  const access = s.guests.filter((g) => g.accessibility)
  if (access.length) lines.push(`- accessible seating: ${access.map((g) => g.name).join(', ')}`)
  return lines.join('\n')
}

function planSummary(s: AppState) {
  return {
    event: { name: s.event.name, template: s.event.template ?? null, vocabulary: s.event.vocab },
    pending_proposal: s.proposal
      ? { moves: s.proposal.moves.length, note: s.proposal.note, hint: 'The human sees Accept/Dismiss buttons; you can also resolve it with resolve_proposal.' }
      : null,
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
      pinned_by_human: !!g.pinned,
    })),
    groups: [...new Set(s.guests.map((g) => g.group).filter(Boolean))].map((group) => ({
      group,
      members: s.guests.filter((g) => g.group === group).length,
      rule: s.groupRules.find((r) => r.group === group) ?? null,
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
      execute: async () => j(planSummary(getState())),
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
      execute: async (input: { guests: { name: string; group?: string; diet?: string; accessibility?: boolean }[] }) => {
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
      execute: async (input: { label: string; capacity: number; shape?: 'round' | 'rect'; accessible?: boolean }) => {
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
      execute: async (input: { guest: string; table: string }) => {
        const s = getState()
        const g = findGuestByName(s, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        if (g.pinned) return j({ error: `${g.name} is pinned by the human (📌). Ask them, or use set_pin to unpin first.` })
        const t = findTable(s, input.table)
        if (!t) return j({ error: `No table matching "${input.table}"` })
        await animated(() =>
        update(
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, tableId: t.id } : x)) }),
          { actor: 'agent', describe: `seated ${g.name} at ${t.label}` }
        )
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
      execute: async (input: { guest: string }) => {
        const s = getState()
        const g = findGuestByName(s, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        if (g.pinned) return j({ error: `${g.name} is pinned by the human (📌). Ask them, or use set_pin to unpin first.` })
        await animated(() =>
        update(
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, tableId: null } : x)) }),
          { actor: 'agent', describe: `unseated ${g.name}` }
        )
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
      execute: async (input: { kind: 'together' | 'apart'; guest_a: string; guest_b: string; note?: string }) => {
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
      name: 'set_group_rule',
      description:
        'Set a placement policy for a whole group: mode "spread" mixes the group across tables (at most max_per_table together — networking dinners, hosts, chatty kids), mode "cluster" keeps them together (the default tendency), mode "none" removes the rule. The solver and conflict checker enforce this.',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string' },
          mode: { type: 'string', enum: ['spread', 'cluster', 'none'] },
          max_per_table: { type: 'number', description: 'Only for spread; default 2.' },
        },
        required: ['group', 'mode'],
      },
      execute: async (input: { group: string; mode: 'spread' | 'cluster' | 'none'; max_per_table?: number }) => {
        const s = getState()
        const match = [...new Set(s.guests.map((g) => g.group).filter(Boolean))].find(
          (g) => g!.toLowerCase() === input.group.toLowerCase() || g!.toLowerCase().includes(input.group.toLowerCase())
        )
        if (!match) return j({ error: `No group matching "${input.group}"` })
        update(
          (st) => ({
            ...st,
            groupRules: [
              ...st.groupRules.filter((r) => r.group !== match),
              ...(input.mode === 'none'
                ? []
                : [{ group: match, mode: input.mode, maxPerTable: input.max_per_table }]),
            ],
          }),
          {
            actor: 'agent',
            describe:
              input.mode === 'none'
                ? `removed the rule for "${match}"`
                : `rule for "${match}": ${input.mode === 'spread' ? `mix across tables (max ${input.max_per_table ?? 2})` : 'keep together'}`,
          }
        )
        agentActsAtCenter(`${match}: ${input.mode}`)
        return j({ ok: true, group: match, violations_now: conflicts(getState()).map((c) => c.message) })
      },
    },
    {
      name: 'propose_arrangement',
      description:
        'PREFERRED way to rearrange the room: run the constraint solver and present the result to the human as a reviewable proposal (they see the move list with Accept / Dismiss buttons; nothing changes until accepted). Never moves guests the human pinned (📌). Set respect_current:true to only place currently unassigned guests. Provide a short note explaining your reasoning.',
      inputSchema: {
        type: 'object',
        properties: {
          respect_current: {
            type: 'boolean',
            description: 'If true, currently seated guests stay put and only unassigned guests are placed.',
          },
          note: { type: 'string', description: 'One sentence shown to the human: why this arrangement.' },
        },
      },
      execute: async (input: { respect_current?: boolean; note?: string }) => {
        const s = getState()
        if (s.tables.length === 0) return j({ error: 'No tables yet — add tables first.' })
        const { moves, movesList, remaining } = computeArrangement(!!input.respect_current)
        if (moves === 0) return j({ ok: true, moves: 0, message: 'Current seating is already optimal under the constraints.' })
        update(
          (st) => ({
            ...st,
            proposal: { moves: movesList, note: input.note ?? 'Solver-optimized arrangement', createdAt: Date.now() },
          }),
          { actor: 'agent', describe: `proposed an arrangement (${moves} moves) — awaiting review` }
        )
        agentActsAtCenter(`proposal · ${moves} moves`)
        return j({
          ok: true,
          status: 'pending_human_review',
          moves,
          conflicts_after_if_accepted: remaining,
          proposed_moves: describeMoves(movesList),
        })
      },
    },
    {
      name: 'auto_arrange',
      description:
        'Run the constraint solver and apply the result IMMEDIATELY, without human review. Never moves guests the human pinned (📌). Prefer propose_arrangement unless the human explicitly asked you to just do it. Set respect_current:true to only place unassigned guests.',
      inputSchema: {
        type: 'object',
        properties: {
          respect_current: {
            type: 'boolean',
            description: 'If true, currently seated guests stay put and only unassigned guests are placed.',
          },
        },
      },
      execute: async (input: { respect_current?: boolean }) => {
        const s = getState()
        if (s.tables.length === 0) return j({ error: 'No tables yet — add tables first.' })
        const { seats, moves, remaining } = computeArrangement(!!input.respect_current)
        await animated(() =>
        update(
          (st) => ({
            ...st,
            proposal: null,
            guests: st.guests.map((g) => ({ ...g, tableId: seats.get(g.id) ?? null })),
          }),
          { actor: 'agent', describe: `auto-arranged the room (${moves} moves)` }
        )
        )
        agentActsAtCenter(`auto-arrange · ${moves} moves`)
        return j({ ok: true, moves, remaining_conflicts: remaining, plan: planSummary(getState()).tables })
      },
    },
    {
      name: 'resolve_proposal',
      description:
        'Apply or withdraw the pending arrangement proposal. Use action "apply" only when the human said yes in conversation; use "withdraw" to retract your own proposal.',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['apply', 'withdraw'] } },
        required: ['action'],
      },
      execute: async (input: { action: 'apply' | 'withdraw' }) => {
        const ok = input.action === 'apply' ? applyProposal('agent') : dismissProposal('agent')
        if (ok) agentActsAtCenter(input.action === 'apply' ? 'proposal applied' : 'proposal withdrawn')
        return j(ok ? { ok: true } : { error: 'No pending proposal.' })
      },
    },
    {
      name: 'set_pin',
      description:
        'Pin or unpin a guest. Pinned guests (📌) are human-locked decisions: the solver and rearrangement never move them. Guests the human seats by drag are pinned automatically; only unpin when the human asks.',
      inputSchema: {
        type: 'object',
        properties: { guest: { type: 'string' }, pinned: { type: 'boolean' } },
        required: ['guest', 'pinned'],
      },
      execute: async (input: { guest: string; pinned: boolean }) => {
        const s = getState()
        const g = findGuestByName(s, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        update(
          (st) => ({ ...st, guests: st.guests.map((x) => (x.id === g.id ? { ...x, pinned: input.pinned } : x)) }),
          { actor: 'agent', describe: `${input.pinned ? 'pinned' : 'unpinned'} ${g.name}` }
        )
        agentActsAtTable(g.tableId, `${input.pinned ? '📌' : 'unpin'} ${g.name}`)
        return j({ ok: true })
      },
    },
    {
      name: 'load_template',
      description: `Start a scenario from a template. Replaces the current plan. Available: ${TEMPLATES.map((t) => `"${t.id}" (${t.blurb})`).join(' · ')}`,
      inputSchema: {
        type: 'object',
        properties: { template: { type: 'string', enum: TEMPLATES.map((t) => t.id) } },
        required: ['template'],
      },
      execute: async (input: { template: string }) => {
        const name = loadTemplate(input.template, 'agent')
        if (!name) return j({ error: `Unknown template "${input.template}"` })
        agentActsAtCenter('loaded template')
        return j({ ok: true, event: name, plan: planSummary(getState()) })
      },
    },
    {
      name: 'explain_seating',
      description:
        'Explain WHY someone sits where they sit: which together/apart requests, group rules, accessibility needs, and pins shaped their placement. Pass a guest name, or a table label to explain everyone at that table. Use this when the human asks "why is X there?" or before proposing changes.',
      inputSchema: {
        type: 'object',
        properties: {
          guest: { type: 'string', description: 'Guest name (optional if table is given).' },
          table: { type: 'string', description: 'Table label — explains every guest seated there.' },
        },
      },
      annotations: { readOnlyHint: true },
      execute: async (input: { guest?: string; table?: string }) => {
        const s = getState()
        if (input.guest) {
          const g = findGuestByName(s, input.guest)
          if (!g) return j({ error: `No guest matching "${input.guest}"` })
          return j({ guest: g.name, table: s.tables.find((t) => t.id === g.tableId)?.label ?? null, reasons: explainGuest(s, g) })
        }
        if (input.table) {
          const t = findTable(s, input.table)
          if (!t) return j({ error: `No table matching "${input.table}"` })
          return j({
            table: t.label,
            guests: guestsAt(s, t.id).map((g) => ({ guest: g.name, reasons: explainGuest(s, g) })),
          })
        }
        return j({ error: 'Pass a guest name or a table label.' })
      },
    },
    {
      name: 'get_activity_log',
      description:
        'Read the recent activity feed — every change made by the human (drags, pins, rules, accepts) and by you. Call this when returning to the conversation to catch up on what the human did in the meantime.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max entries, default 25.' } },
      },
      annotations: { readOnlyHint: true },
      execute: async (input: { limit?: number }) => {
        const s = getState()
        const now = Date.now()
        return j(
          s.log.slice(0, Math.max(1, Math.min(100, input.limit ?? 25))).map((l) => ({
            actor: l.actor,
            action: l.text,
            seconds_ago: Math.round((now - l.at) / 1000),
          }))
        )
      },
    },
    {
      name: 'export_plan',
      description:
        'Export the finished plan as clean markdown: per-table seating list plus a dietary/accessibility brief. Use when the human wants to share the plan, email the caterer, or print place cards.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => exportMarkdown(getState()),
    },
    {
      name: 'get_conflicts',
      description: 'List all current conflicts: violated apart/together constraints, over-capacity tables, and accessibility mismatches.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => j(conflicts(getState()).map((c) => ({ severity: c.severity, message: c.message }))),
    },
    {
      name: 'dietary_report',
      description: 'Summarize dietary needs across all guests, and per table — useful for the caterer.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
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
      execute: async () => j({ ok: undo() }),
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
      execute: async () => {
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
      execute: async (input: { guest: string }) => {
        const st = getState()
        const g = findGuestByName(st, input.guest)
        if (!g) return j({ error: `No guest matching "${input.guest}"` })
        if (g.pinned) return j({ error: `${g.name} is pinned by the human (📌).` })
        await animated(() =>
        update(
          (x) => ({ ...x, guests: x.guests.map((gg) => (gg.id === g.id ? { ...gg, tableId: sel } : gg)) }),
          { actor: 'agent', describe: `seated ${g.name} at ${table.label} (selected)` }
        )
        )
        agentActsAt(table.x, table.y, `${g.name} → here`)
        return j({ ok: true })
      },
    },
    {
      name: 'clear_selected_table',
      description: `Move everyone at the selected table ("${table.label}") back to the unassigned pool.`,
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const kept = getState().guests.filter((g) => g.tableId === sel && g.pinned)
        await animated(() =>
        update(
          (x) => ({ ...x, guests: x.guests.map((g) => (g.tableId === sel && !g.pinned ? { ...g, tableId: null } : g)) }),
          { actor: 'agent', describe: `cleared ${table.label}` }
        )
        )
        agentActsAt(table.x, table.y, 'cleared')
        return j({ ok: true, kept_pinned: kept.map((g) => g.name) })
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
      execute: async (input: { capacity?: number; label?: string; accessible?: boolean }) => {
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
