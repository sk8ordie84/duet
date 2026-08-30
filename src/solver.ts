// Constraint-aware seating solver: greedy seeding + local-search improvement.
// Deliberately dependency-free and fast enough to run on every auto-arrange call.

import type { AppState, Guest } from './model'

function score(s: AppState, seats: Map<string, string | null>): number {
  let sc = 0
  const capUsed = new Map<string, number>()
  for (const t of s.tables) capUsed.set(t.id, 0)
  for (const g of s.guests) {
    const t = seats.get(g.id)
    if (t == null) {
      sc -= 50 // unseated guests are bad
      continue
    }
    capUsed.set(t, (capUsed.get(t) ?? 0) + 1)
  }
  const totalSeated = [...capUsed.values()].reduce((a, b) => a + b, 0)
  const totalCapacity = s.tables.reduce((a, t) => a + t.capacity, 0) || 1
  for (const t of s.tables) {
    const used = capUsed.get(t.id) ?? 0
    if (used > t.capacity) sc -= 1000 * (used - t.capacity)
    // soft balance: keep each table near its fair share of the room
    const target = (totalSeated * t.capacity) / totalCapacity
    sc -= Math.abs(used - target) * 14
  }
  for (const c of s.constraints) {
    const ta = seats.get(c.a)
    const tb = seats.get(c.b)
    if (ta == null || tb == null) continue
    if (c.kind === 'apart' && ta === tb) sc -= 800
    if (c.kind === 'together' && ta === tb) sc += 200
    if (c.kind === 'together' && ta !== tb) sc -= 150
  }
  // group affinity: reward guests seated with same group
  const byTable = new Map<string, Guest[]>()
  for (const g of s.guests) {
    const t = seats.get(g.id)
    if (t == null) continue
    if (!byTable.has(t)) byTable.set(t, [])
    byTable.get(t)!.push(g)
  }
  const ruleOf = new Map(s.groupRules.map((r) => [r.group, r]))
  for (const [tid, gs] of byTable) {
    const groups = new Map<string, number>()
    for (const g of gs) if (g.group) groups.set(g.group, (groups.get(g.group) ?? 0) + 1)
    for (const [group, n] of groups) {
      const rule = ruleOf.get(group)
      if (rule?.mode === 'spread') {
        const max = rule.maxPerTable ?? 2
        sc -= n * (n - 1) * 6 // discourage same-group pairs
        if (n > max) sc -= 600 * (n - max) // hard-ish cap
      } else {
        sc += n * (n - 1) * 4 // pairs of same group like sitting together
      }
    }
    // accessibility fit
    const table = s.tables.find((t) => t.id === tid)!
    for (const g of gs) if (g.accessibility && !table.accessible) sc -= 900
  }
  return sc
}

/**
 * Solve seating. `locked` guests keep their current table (human decisions are respected).
 * Returns the proposed seats map and the number of moves relative to current state.
 */
export function solve(
  s: AppState,
  opts?: { locked?: Set<string>; iterations?: number }
): { seats: Map<string, string | null>; moves: number; score: number } {
  const locked = opts?.locked ?? new Set<string>()
  const seats = new Map<string, string | null>()
  for (const g of s.guests) seats.set(g.id, locked.has(g.id) ? g.tableId : null)

  // Greedy seeding: place unlocked guests, grouped by `group`, into best table.
  const unplaced = s.guests.filter((g) => !locked.has(g.id))
  // sort: accessibility first, then bigger groups first
  const groupSize = new Map<string, number>()
  for (const g of s.guests) if (g.group) groupSize.set(g.group, (groupSize.get(g.group) ?? 0) + 1)
  unplaced.sort((a, b) => {
    if (!!b.accessibility !== !!a.accessibility) return a.accessibility ? -1 : 1
    return (groupSize.get(b.group ?? '') ?? 0) - (groupSize.get(a.group ?? '') ?? 0)
  })
  for (const g of unplaced) {
    let best: string | null = null
    let bestDelta = -Infinity
    for (const t of s.tables) {
      seats.set(g.id, t.id)
      const d = score(s, seats)
      if (d > bestDelta) {
        bestDelta = d
        best = t.id
      }
    }
    seats.set(g.id, best)
  }

  // Local search: random pair swaps + relocations.
  let cur = score(s, seats)
  const ids = s.guests.filter((g) => !locked.has(g.id)).map((g) => g.id)
  const iters = opts?.iterations ?? 4000
  let seed = 42
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < iters && ids.length > 0; i++) {
    const a = ids[Math.floor(rnd() * ids.length)]
    if (rnd() < 0.5) {
      // swap two guests
      const b = ids[Math.floor(rnd() * ids.length)]
      if (a === b) continue
      const ta = seats.get(a) ?? null
      const tb = seats.get(b) ?? null
      if (ta === tb) continue
      seats.set(a, tb)
      seats.set(b, ta)
      const ns = score(s, seats)
      if (ns >= cur) cur = ns
      else {
        seats.set(a, ta)
        seats.set(b, tb)
      }
    } else {
      // move one guest to a random table
      const t = s.tables[Math.floor(rnd() * s.tables.length)]
      if (!t) continue
      const prev = seats.get(a) ?? null
      if (prev === t.id) continue
      seats.set(a, t.id)
      const ns = score(s, seats)
      if (ns >= cur) cur = ns
      else seats.set(a, prev)
    }
  }

  // Repair pass: targeted fixes for violated "together" constraints that random
  // search may miss (e.g. every table exactly full, so only one specific swap works).
  for (let round = 0; round < 3; round++) {
    let fixedAny = false
    for (const c of s.constraints) {
      if (c.kind !== 'together') continue
      const ta = seats.get(c.a)
      const tb = seats.get(c.b)
      if (ta == null || tb == null || ta === tb) continue
      const movable = [
        { id: c.a, from: ta, to: tb },
        { id: c.b, from: tb, to: ta },
      ].filter((m) => !locked.has(m.id))
      let bestScore = cur
      let bestApply: (() => void) | null = null
      for (const m of movable) {
        // try direct move (if capacity allows) and every swap with an occupant of the target table
        const occupants = s.guests.filter((g) => seats.get(g.id) === m.to && !locked.has(g.id) && g.id !== c.a && g.id !== c.b)
        // tables with spare capacity, for 3-way relocations
        const used = new Map<string, number>()
        for (const g of s.guests) {
          const t = seats.get(g.id)
          if (t != null) used.set(t, (used.get(t) ?? 0) + 1)
        }
        const spare = s.tables.filter((t) => (used.get(t.id) ?? 0) < t.capacity).map((t) => t.id)
        const candidates: Array<[string, string | null][]> = [
          [[m.id, m.to]],
          ...occupants.map((o) => [[m.id, m.to], [o.id, m.from]] as [string, string | null][]),
          ...occupants.flatMap((o) =>
            spare
              .filter((t2) => t2 !== m.to)
              .map((t2) => [[m.id, m.to], [o.id, t2]] as [string, string | null][])
          ),
        ]
        for (const change of candidates) {
          const prev = change.map(([id]) => [id, seats.get(id) ?? null] as const)
          for (const [id, t] of change) seats.set(id, t)
          const ns = score(s, seats)
          if (ns > bestScore) {
            bestScore = ns
            const frozen = change.map((c) => [...c] as [string, string | null])
            bestApply = () => {
              for (const [id, t] of frozen) seats.set(id, t)
            }
          }
          for (const [id, t] of prev) seats.set(id, t)
        }
      }
      if (bestApply) {
        bestApply()
        cur = bestScore
        fixedAny = true
      }
    }
    if (!fixedAny) break
  }

  let moves = 0
  for (const g of s.guests) if (seats.get(g.id) !== g.tableId) moves++
  return { seats, moves, score: cur }
}
