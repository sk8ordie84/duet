# Duet — plan the room with your agent

**Duet is an arrangement planner where you and your AI agent work the same floor plan, live.**
Weddings, fundraising galas, office seating, classrooms — any problem shaped like
*people × limited places × human relationships*. You make the judgment calls; your agent
does the constraint labor.

Built for the [WebMCP Challenge](https://webmcp.devpost.com). Everything the agent does
happens **in your tab, on the state you're looking at** — no backend API, no screen
scraping. The app registers real tools via WebMCP (`document.modelContext.registerTool`),
and the agent shows up on the board as a live cursor.

## The collaboration contract

Duet isn't "a UI the agent can also poke at" — the human and agent have different,
enforced powers:

- **Pins are law.** Drag someone to a seat and they're pinned 📌 — the solver plans
  around them and every agent tool that tries to move them is refused with an
  explanation. Double-click to unpin.
- **Proposals, not surprises.** The agent's preferred rearrangement tool
  (`propose_arrangement`) doesn't touch the board: it produces a reviewable proposal —
  a banner with the move list and the agent's reasoning — that only the human can
  accept or dismiss. (`auto_arrange` applies directly, and its description tells the
  agent to prefer proposing.)
- **Tools follow your focus.** Selecting a table dynamically registers table-scoped
  tools (`seat_at_selected_table`, `clear_selected_table`, …) via `AbortSignal` —
  deselect, and they're gone. The agent always knows what you're looking at.
- **Everything is visible and reversible.** Agent actions animate as a violet cursor
  on the board, land in the activity feed labeled `✳ agent`, and undo/redo (⌘Z/⌘⇧Z)
  works on both sides' actions.
- **The solver explains itself.** `explain_seating` answers "why is Grandpa Joe
  there?" with the actual binding reasons — together requests, feuds avoided, group
  rules, accessibility, pins. And `get_activity_log` lets the agent catch up on what
  the human did while it was away.

## Why this is a strong fit for WebMCP

A drag-and-drop floor plan is exactly the kind of UI agents are hopeless at driving
through pixels — and exactly the kind of chore (120 guests, 16 tables, feuds, diets,
accessibility needs) humans are hopeless at solving in their head. WebMCP splits the
work along the right line: taste and authority stay with the human; import, constraint
tracking, solving, and reporting go to the agent.

## How tools are registered

All 20 tools go through the standard WebMCP API ([src/webmcp.ts](src/webmcp.ts)):

```js
document.modelContext.registerTool({
  name: 'seat_guest',
  description: 'Seat a guest at a table (or move them there)…',
  inputSchema: { type: 'object', properties: { guest: { type: 'string' }, table: { type: 'string' } }, required: ['guest', 'table'] },
  execute: async (input) => { /* mutate the board, return structured JSON */ },
})
```

Selection-scoped tools additionally pass `{ signal }` from an `AbortController` and are
revoked the moment the human deselects the table.

## Try it (for judges too)

1. Open **https://duet-ten.vercel.app** in ChatGPT's in-app browser (WebMCP works out of
   the box) or in Chrome with `chrome://flags/#enable-webmcp-testing` enabled.
2. Pick a template (tables load empty — everyone starts in the pool).
3. Ask the agent: *"Get the seating plan, then propose an arrangement."* Review the
   violet banner, press **Accept**, and watch the seats morph into place.
4. Drag someone yourself — they get pinned 📌; ask the agent to rearrange and it must
   work around your call. Drag two feuding guests together to see conflict notes
   (the red tag on a table is draggable; hover it for the notes).
5. Select a table and ask *"who's at this table?"* — the agent's tool list follows
   your selection.

No WebMCP browser at hand? The app installs a console shim with the same registry:
`__webmcp.list()` and `__webmcp.call('auto_arrange', {})`.

More things to ask your agent:

> "Load the gala template and propose a seating plan."
> "Add my guests: Ali (groom's family, vegan), Sara (college friends)…"
> "These two can't stand each other — keep them apart, then propose a fix."
> *(drag someone yourself — now they're pinned and the agent must work around you)*
> *(select a table)* "Who's at this table? Fill the empty seats."
> "Export the plan and draft an email to the caterer."

## Scenarios

| Template | Scale | What makes it hard |
| --- | --- | --- |
| 💍 Wedding reception | 24 guests, 6 tables | Feuds, divorces, exes; dietary needs; head table |
| 🥂 Fundraising gala | 120 guests, 16 tables | Donors anchored to hosts, press placement |
| 🤝 Corporate dinner | 6 companies, 6 tables | Companies **mixed** for networking (group rule: max 2 per table), a pinned host anchoring every table, competitor pairs kept apart |
| 🏢 Office seating | 23 employees, 6 zones | Quiet zones vs sales calls, team adjacency |
| 🎓 Classroom | 28 students, 7 pods | Reading groups, chatty pairs to separate |

Relationships are modeled three ways: **pair constraints** (together / apart, with
notes like "divorced in 2019"), **group rules** (keep a group together, or spread it —
at most N per table; toggle from the sidebar or via the agent's `set_group_rule`), and
**pins** (hard human decisions). The solver also balances table fullness.

The engine is domain-agnostic; templates just seed people, places, constraints, and
vocabulary. Agents can also start from a blank board (`add_table`, `add_guests`) or
switch scenarios themselves (`load_template`).

## Run locally

```bash
npm install
npm run dev
```

Rounding out the product: paste-import for guest lists, per-group placement rules
(keep together / mix across tables), a relationships panel with notes ("divorced in
2019"), printable place cards + escort list + catering brief (🖨), zoom/fit-to-view,
conflict notes that shake and pan the room when trouble appears, and a touch of
synthesized sound design (mutable).

## Implementation notes

- `src/webmcp.ts` — all tool registration (18 base + 4 selection-scoped). Base toolset registers once;
  selection-scoped tools register/unregister with `AbortController` as the human
  clicks around. Pinned guests are enforced at the tool layer, not just the solver.
- `src/solver.ts` — dependency-free seating solver: greedy seeding + local search +
  a targeted repair pass (including 3-way relocations) over capacities,
  together/apart constraints, group affinity, and accessibility.
- `src/model.ts` — single store with undo stack, human/agent activity log, conflict
  engine, proposal state, and localStorage persistence.
- `src/templates.ts` — the four scenarios.
- React + Vite + TypeScript, no other runtime dependencies.

## License

MIT
