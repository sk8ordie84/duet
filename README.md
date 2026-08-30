# Duet — seat a wedding with your agent

**Duet is a seating planner where you and your AI agent work the same floor plan, live.**
You make the judgment calls — drag Aunt Feride away from Uncle Cem. Your agent does the
constraint labor — importing the guest list, recording who's feuding, balancing tables,
re-solving the room, and briefing the caterer.

Built for the [WebMCP Challenge](https://webmcp.devpost.com). Everything the agent does
happens **in your tab, on the state you're looking at** — no backend API, no screen
scraping. The app registers real tools via WebMCP (`document.modelContext.registerTool`),
and the agent's actions show up as a live cursor on the board.

## Why this is a strong fit for WebMCP

A drag-and-drop seating chart is exactly the kind of UI agents are hopeless at driving
through pixels — and exactly the kind of chore (24 guests, 6 tables, 5 feuds, 3 diets)
humans are hopeless at solving in their head. WebMCP splits the work along the right
line:

- **The human** keeps taste and authority: drag anyone anywhere, select a table to focus
  the conversation, undo anything the agent did.
- **The agent** gets structured levers: `add_guests`, `add_constraint`,
  `seat_guest`, `auto_arrange` (a real constraint solver), `get_conflicts`,
  `dietary_report`, `undo_last_change`…
- **Tools follow the human's focus.** Selecting a table dynamically registers
  table-scoped tools (`seat_at_selected_table`, `clear_selected_table`, …) via
  `AbortSignal` — deselect, and they're gone. The agent always knows what the human is
  looking at.

## Try it

- **ChatGPT's in-app browser** supports WebMCP out of the box — just open the deployed URL.
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the URL.
- **No WebMCP?** The app installs a console shim with the same registry:
  `__webmcp.list()` and `__webmcp.call('auto_arrange', {})`.

Things to ask your agent:

> "Load my guest list: … (paste 20 names with families)"
> "Uncle Cem and Robert can't stand each other — keep them apart."
> "Seat everyone. Respect what I've placed by hand."
> "Who's vegan? Give me a per-table dietary brief for the caterer."
> *(select a table)* "Who's at this table? Fill the empty seats from the college friends."

## Run locally

```bash
npm install
npm run dev
```

## Implementation notes

- `src/webmcp.ts` — all tool registration. Base toolset registers once; selection-scoped
  tools register/unregister with `AbortController` as the human clicks around.
- `src/solver.ts` — dependency-free seating solver (greedy seeding + local search) over
  capacities, together/apart constraints, group affinity, and accessibility.
- `src/model.ts` — single store with undo stack, activity log (human vs agent actions),
  conflict engine, and localStorage persistence.
- React + Vite + TypeScript, no other runtime dependencies.

## License

MIT
