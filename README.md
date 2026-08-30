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
  on the board, land in the activity feed labeled `✳ agent`, and `undo` works on both
  sides.

## Why this is a strong fit for WebMCP

A drag-and-drop floor plan is exactly the kind of UI agents are hopeless at driving
through pixels — and exactly the kind of chore (120 guests, 16 tables, feuds, diets,
accessibility needs) humans are hopeless at solving in their head. WebMCP splits the
work along the right line: taste and authority stay with the human; import, constraint
tracking, solving, and reporting go to the agent.

## Try it

- **ChatGPT's in-app browser** supports WebMCP out of the box — just open the deployed URL.
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the URL.
- **No WebMCP?** The app installs a console shim with the same registry:
  `__webmcp.list()` and `__webmcp.call('auto_arrange', {})`.

Things to ask your agent:

> "Load the gala template and propose a seating plan."
> "Add my guests: Ali (groom's family, vegan), Sara (college friends)…"
> "These two can't stand each other — keep them apart, then propose a fix."
> *(drag someone yourself — now they're pinned and the agent must work around you)*
> *(select a table)* "Who's at this table? Fill the empty seats."
> "Export the plan and draft an email to the caterer."

## Scenarios

| Template | Scale | What makes it hard |
| --- | --- | --- |
| 💍 Wedding reception | 24 guests, 6 tables | Feuding relatives, dietary needs, head table |
| 🥂 Fundraising gala | 120 guests, 16 tables | Donors anchored to hosts, press placement |
| 🏢 Office seating | 23 employees, 6 zones | Quiet zones vs sales calls, team adjacency |
| 🎓 Classroom | 28 students, 7 pods | Reading groups, chatty pairs to separate |

The engine is domain-agnostic; templates just seed people, places, constraints, and
vocabulary. Agents can also start from a blank board (`add_table`, `add_guests`) or
switch scenarios themselves (`load_template`).

## Run locally

```bash
npm install
npm run dev
```

## Implementation notes

- `src/webmcp.ts` — all tool registration (16 tools). Base toolset registers once;
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
