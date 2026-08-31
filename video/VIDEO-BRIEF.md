# DUET — WebMCP Challenge Demo Film

Create a polished 2 minute 30 second to 2 minute 45 second product demo for the OpenAI WebMCP Challenge.

This is not a commercial advertisement and must not look like a generic AI startup promo.

The real DUET application and supplied screen recordings are the hero. Do not recreate, hallucinate, redesign, or replace the DUET interface. Preserve all UI text and interactions exactly as they appear in the supplied recordings.

The visual style should feel like a world-class software launch film: restrained, intelligent, minimal, precise, editorial, and technical.

Use clean typography, controlled zooms, subtle motion, occasional dark or neutral interstitial title cards, and restrained sound design.

Do not use fake people, stock footage, futuristic AI imagery, robots, glowing brains, holograms, generic office footage, or abstract AI visuals.

## Core idea

DUET is a collaborative seating planner built for WebMCP.

Seating a room is a two-brain problem.

Humans understand the social context that software rarely captures: who is divorced, who should meet, who must not sit together, who needs to be near an exit.

Agents are better at satisfying a large number of combinatorial constraints simultaneously.

DUET lets both work together on the same live visual surface.

The human visually arranges and pins important decisions.

The agent uses structured WebMCP tools and a real constraint solver to plan around them.

## Supplied assets

- `01-gala-load.mp4` — DUET opens, the 120-guest fundraising gala template is chosen, the room appears.
- `02-human-pins.mp4` — the human drags two guests into place by hand; both show the pin badge.
- `03-agent-solver.mp4` — the agent adds constraints, runs the solver, and a proposal banner appears ("118 moves"); after a pause the human clicks Accept and the whole room animates into place.
- `04-conflict-explain.mp4` — a deliberate conflict: two feuding guests on one table; DUET pans to the table, flags it, and the conflict notes appear.
- `05-dynamic-tools.mp4` — a live WebMCP tool registry panel: selecting a table makes table-scoped tools appear; deselecting removes them.
- `06-caterer.mp4` — the agent produces the caterer's brief; the real per-table dietary output is shown.
- `README.md`, `webmcp.ts`, `solver.ts`, `templates.ts` — context only, for understanding the product. Do not show long code sequences.

## Narrative structure

### OPEN — 0:00–0:12
Begin directly on the DUET interface. Show the 120-person fundraising gala.
Minimal title:
DUET
Human judgment. Agent computation. One shared surface.
Do not spend time on a logo animation.

### THE HUMAN — 0:12–0:30
Show the human manually dragging two important guests into position (`02-human-pins.mp4`). Emphasize the PIN icons.
Narration: "Seating a room is a two-brain problem. People understand the relationships, exceptions and social context. Agents are better at satisfying hundreds of constraints at once."
On-screen text: HUMAN DECISIONS BECOME CONSTRAINTS — then: PINS ARE LAW

### THE AGENT — 0:30–1:05
Use the supplied real agent interaction (`03-agent-solver.mp4`). The user asks the agent to keep press away from the board, limit each company to two guests per table, and arrange everyone else.
Show the constraints entering the application. Show the proposal containing approximately 118 moves. Do not immediately accept it. Pause long enough for the viewer to understand that the agent has proposed an arrangement rather than silently changing the room.
Narration: "The agent doesn't take control away from the human. It works around pinned decisions, applies structured constraints, runs the solver, and proposes the remaining arrangement."
On-screen text: 118 MOVES — 0 HUMAN PINS TOUCHED
Then show the user clicking Accept. Show the room rearranging.
On-screen text: AGENTS PROPOSE. HUMANS DECIDE.

### EXPLAINABILITY — 1:05–1:28
Show the deliberate seating conflict (`04-conflict-explain.mp4`). Show DUET identifying and focusing the offending table. Then show the explanation of why the placement is problematic.
Narration: "Every decision remains inspectable. Create a conflict and DUET identifies the affected table, preserves the underlying notes, and can explain individual placements on request."
On-screen text: VISIBLE — EXPLAINABLE — REVERSIBLE

### WEBMCP-NATIVE INTERACTION — 1:28–1:52
Show the dynamic tool behavior (`05-dynamic-tools.mp4`). No table selected. Select one table. Show table-scoped WebMCP tools becoming available. Deselect the table. Show those tools disappearing.
Narration: "Even the agent's capabilities follow the human's attention. Selecting a table dynamically registers table-scoped WebMCP tools. Deselecting it removes them."
Large on-screen text: THE TOOL SURFACE FOLLOWS HUMAN ATTENTION
This is an important moment. Allow the interaction to breathe.

### USEFUL OUTPUT — 1:52–2:12
Show the real prompt: "Give me the caterer's brief." (`06-caterer.mp4`)
Show the dietary breakdown generated from the live room state.
Narration: "The same shared state can immediately become operational output — including per-table dietary counts for the caterer."

### IMPLEMENTATION — 2:12–2:35
Return to the application. Use restrained technical overlays rather than long code sequences.
Display:
21 BASE WEBMCP TOOLS
4 DYNAMIC SELECTION-SCOPED TOOLS
STRUCTURED JSON RESULTS
PIN GUARDRAILS AT THE TOOL LAYER
DEPENDENCY-FREE CONSTRAINT SOLVER
~75 MS / 120 GUESTS
Narration: "DUET exposes twenty-one base WebMCP tools and four dynamic selection-scoped tools. Guardrails live at the tool layer, tool results are structured for agent reasoning, and the dependency-free solver handles a 120-person room in roughly seventy-five milliseconds."

### CLOSE — 2:35–2:45
Show the completed gala seating plan. Then briefly reveal the scenario options: Wedding, Fundraising Gala, Networking Dinner, Office, Classroom.
Final narration: "Human judgment steering agent computation, on the same live surface. That's DUET."
Final title:
DUET
BUILT FOR THE WEBMCP CHALLENGE

Keep the entire finished video below 2 minutes 50 seconds.

## Editing rules

Always prioritize real supplied DUET screen recordings. Never generate fake versions of the product UI. Never fabricate interactions that are not shown in the supplied footage. Use screen zooms and crops only when needed to direct attention. Keep transitions minimal. Avoid excessive kinetic typography. Do not make it look like a social-media advertisement. Do not use copyrighted music. Music should be minimal, contemporary, understated electronic sound design with enough space for narration.

Narration should be English, calm, intelligent, confident and conversational — not overexcited, salesy, cinematic-trailer style, or stereotypical AI narration.

The audience is a technical judging panel from companies such as OpenAI, Chrome, Cloudflare, Vercel and Shopify. The objective is for a judge to understand within the first 45 seconds why this product becomes meaningfully better specifically because of WebMCP.
