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
  for (const t of s.tables) {
    const used = capUsed.get(t.id) ?? 0
    if (used > t.capacity) sc -= 1000 * (used - t.capacity)
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
  for (const [tid, gs] of byTable) {
    const groups = new Map<string, number>()
    for (const g of gs) if (g.group) groups.set(g.group, (groups.get(g.group) ?? 0) + 1)
    for (const n of groups.values()) sc += n * (n - 1) * 4 // pairs of same group
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

  let moves = 0
  for (const g of s.guests) if (seats.get(g.id) !== g.tableId) moves++
  return { seats, moves, score: cur }
}
