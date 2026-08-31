# Devpost submission — Duet

*Draft text for the WebMCP Challenge submission form.*

**Live URL:** https://duet-ten.vercel.app
**Repo:** https://github.com/sk8ordie84/duet (MIT)

---

## Why this use case is a strong fit for WebMCP

Seating a room is a two-brain problem.

One brain holds context no form can capture: who is divorced, which sponsor is feuding with whom, which aunt needs to sit near the exit. The other has to satisfy a combinatorial pile of constraints: table capacities, conflicts, introductions, dietary needs, accessibility, company-mixing rules, and table balance.

Humans are great at the first and bad at the second. Agents are the opposite.

Before WebMCP, neither interface worked well. A drag-and-drop floor plan is a terrible surface for an agent to operate through pixels, while moving the task into chat throws away the human's spatial judgment.

Duet lets both work on the same live state, in the same tab: the human drags, pins, and visually evaluates the room while the agent uses structured tools such as `seat_guest`, `add_constraint`, `set_group_rule`, and a real constraint solver.

## How it creates a better user experience

Duet gives human-agent collaboration an explicit contract, enforced in code.

**Pins are law.** Any guest placed manually is pinned. The solver plans around those decisions, and agent tools are refused if they attempt to move or remove a pinned guest.

**Agents propose; humans decide.** The preferred agent tool, `propose_arrangement`, does not mutate the room. It displays the reasoning and complete move list first. Only the human can Accept or Dismiss it.

**The tool surface follows human attention.** Selecting a table dynamically exposes table-scoped tools such as `seat_at_selected_table` and `clear_selected_table`. Deselecting it removes them.

**Everything is visible and reversible.** Agent actions appear as a violet cursor on the board, every action enters a shared activity feed, and undo/redo works across both human and agent actions.

## What becomes possible — together — that wasn't before

Load a 120-guest fundraising gala. The human manually places two important guests, pinning them. The agent records "press away from the board", applies "maximum two people from the same company per table", and proposes a complete arrangement for the remaining 118 guests. The solver honors every constraint without touching the human's pins; the human reviews and accepts in one click.

Create a conflict deliberately and Duet pans to the affected table, identifies who conflicts and why, and lets the agent call `explain_seating` to justify individual placements. Then ask "give me the caterer's brief" and `export_plan` returns dietary counts by table.

That loop — human judgment steering an agent and a constraint solver through conversation, directly on a shared visual surface — is what WebMCP makes possible. Five scenarios ship on the same engine: wedding, gala, corporate dinner, office seating, classroom.

## How we implemented WebMCP

21 base tools via `document.modelContext.registerTool` (guest/table CRUD, pair constraints with notes, group spread/cluster rules, solver, proposals, pins, dietary reports, Markdown export, template loading, undo, `explain_seating`, `get_activity_log`) plus 4 dynamic selection-scoped tools registered/removed with `AbortController` — the tool surface mirrors the human's focus. Tool results return structured JSON including the conflicts an action would create; guardrails are enforced at the tool layer. The dependency-free solver (greedy + local search + targeted repair + three-way relocation) solves a 120-guest room in ~75 ms. React + Vite + TypeScript, no backend — the entire collaborative state lives in the tab, exactly where WebMCP operates.

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
