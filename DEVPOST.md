# Devpost submission — Duet

*Draft text for the WebMCP Challenge submission form.*

**Live URL:** https://duet-ten.vercel.app
**Repo:** https://github.com/sk8ordie84/duet (MIT)

---

## Why this use case is a strong fit for WebMCP

Seating a room is a two-brain problem. One brain holds things no app field can capture —
who is divorced, which sponsor is suing whom, which aunt must be near the exit. The other
brain has to satisfy a combinatorial pile: capacities, feuds, "please introduce these
two", dietary needs, accessibility, company-mixing policies, table balance. Humans are
great at the first and terrible at the second; agents are the opposite.

Before WebMCP, an agent couldn't help here: a drag-and-drop floor plan is the worst
possible surface for pixel-driving, and moving the work to a chat thread throws away the
human's visual judgment. WebMCP lets both sides work the surface they're best at — the
human drags and eyeballs the actual room, the agent calls `seat_guest`,
`add_constraint`, `set_group_rule`, and a real constraint solver — on the same live
state, in the same tab.

## How it creates a better user experience

Duet gives the collaboration an explicit contract, enforced in code:

- **Pins are law.** Any guest the human places by hand is pinned 📌. The solver plans
  around pins, and agent tools that try to move a pinned guest are refused with an
  explanation the agent can relay ("pinned by the human — ask them").
- **Proposals, not surprises.** The agent's preferred tool, `propose_arrangement`,
  changes nothing: it renders a banner with the agent's reasoning and the full move
  list. Only the human can Accept or Dismiss. (`auto_arrange` exists for "just do it".)
- **Tools follow the human's focus.** Selecting a table registers table-scoped tools
  via `AbortSignal` (`seat_at_selected_table`, `clear_selected_table`, …); deselecting
  removes them. The agent always knows what the human is looking at.
- **Everything is visible and reversible.** Agent actions animate as a violet cursor on
  the board, land in an activity feed labeled `✳ agent` vs `● you`, and undo works on
  both sides' actions.

## What people and agents can do together that was difficult or impossible before

Load the 120-guest fundraising gala. The human pins the board chair and drags one donor
next to a friend. The agent imports the rest of the list, records "press away from the
board", applies "max 2 per company per table", and proposes a full arrangement — 120
moves, every constraint honored, pins untouched — which the human reviews and accepts
in one click. Then: "give me the caterer's brief" → `export_plan` returns per-table
dietary counts. That loop — human judgment steering a solver through conversation,
live on a shared visual surface — did not exist before WebMCP. The same engine ships
five scenarios: wedding, gala, corporate networking dinner, office seating, classroom.

## How we implemented WebMCP

- 21 base tools registered with `document.modelContext.registerTool` (full guest and
  table CRUD, pair constraints with notes, group rules, solver, proposals, pins,
  dietary reports, markdown export, template loading, undo, `explain_seating` — the solver justifies any
  placement on request — and `get_activity_log`, so a returning agent can catch up on
  what the human did in the meantime).
- 4 dynamic, selection-scoped tools registered/unregistered with `AbortController` as
  selection changes — the tool list itself mirrors the human's focus.
- Tool results return structured JSON (including "what conflicts would this create"),
  so the agent can reason about consequences before acting.
- Guardrails live at the tool layer: pinned guests are refused, `propose_arrangement`
  is described as preferred so agents default to human review.
- Dependency-free constraint solver (greedy + local search + targeted repair with
  3-way relocations) runs in ~75 ms for 120 guests, honoring pins, pair constraints,
  group spread/cluster rules, accessibility, and table balance.
- React + Vite + TypeScript; no backend — the entire app state lives in the tab,
  which is exactly the point of WebMCP.

---

## Testing instructions (for the submission form)

1. Open https://duet-ten.vercel.app in ChatGPT's in-app browser, or in Google Chrome
   149+ with `chrome://flags/#enable-webmcp-testing` enabled (relaunch after enabling).
   No login or credentials needed.
2. Pick any template — tables load empty; everyone starts in the pool.
3. Ask the agent: "Get the seating plan, then propose an arrangement." A violet
   proposal banner appears; click Review to see the move list, then Accept.
4. Drag a guest onto a table by hand — they get pinned 📌. Ask the agent to
   rearrange: it must (and will) work around your pin.
5. Drag two feuding guests to the same table — a red tag appears on it (draggable;
   hover it for the handwritten conflict notes), and the top-left dock lists all issues.
6. Click a table to select it, then ask "who is at this table?" — the agent's
   available tools change with your selection (selection-scoped WebMCP tools).
7. Ask "give me the caterer's brief" or press ⇪ Export for the markdown plan.

No WebMCP browser available: open the DevTools console — the same tool registry is
exposed as `__webmcp.list()` / `__webmcp.call('auto_arrange', {})`.

---

## 3-minute video outline (not part of the form)

1. (0:00) Cold open: gala board, 120 unseated. "This is a two-brain problem."
2. (0:20) Human pins two guests by drag. 📌 appears.
3. (0:35) Agent chat: "seat everyone — press away from the board, mix the companies."
   Violet cursor sweeps, proposal banner appears with reasoning.
4. (1:05) Human clicks Review — move list — Accept. Room fills, conflicts: 0.
5. (1:25) Human drags one guest "wrong" → conflict panel lights up; asks agent to fix
   → agent proposes a two-move repair, respects the pin.
6. (1:50) Select a table → agent's tool list changes (show the dynamic tools).
7. (2:10) "Export the plan for the caterer" → markdown brief.
8. (2:25) Quick template montage: wedding feuds, office quiet zones, classroom.
9. (2:45) Close: "Built on WebMCP — humans keep judgment, agents do the labor."
