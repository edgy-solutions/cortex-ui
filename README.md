# The Cortex — Agent Mesh Interface

A cinematic **"Dark Glass & Neon"** control center for interrogating an autonomous AI Agent mesh. Think futuristic mission control — not a corporate dashboard.

The Cortex lets you converse with an AI agent mesh that iteratively builds a BPMN workflow graph. The system simulates industrial ontology scans (IOF-MRO), data model binding, and pipeline compilation — all with a cyberpunk aesthetic featuring glassmorphism panels, neon accents, typewriter streaming, and holographic visualizations.

## What It Does

**1. Neural Stream** — A streaming chat interface that simulates a dialogue with an AI mesh. Real-time "Thinking Cards" reflect the internal processing stages of the simulated agents.

**2. Live Context HUD** — A real-time sidebar that accumulates extracted ontology concepts (e.g. `Asset: Engine`, `Concept: iof:ImpactDamage`) and identified data models with health indicators.

**3. Holographic Blueprint** — After enough context is gathered, the UI transitions to an interactive React Flow node graph showing the generated workflow: Trigger nodes → Logic nodes → Action nodes, with animated pulsing edges.

**4. Compilation Sequence** — Clicking "Compile Workflow" triggers a simulated deployment sequence. The system plays back a terminal boot log in a full-screen overlay — complete with `[AGENT] Provisioning task: ...` lines — ending with **SYSTEM ONLINE**.

## Quick Start

The frontend works standalone with a built-in mock agent.

```bash
git clone <repo-url>
cd cortex-ui
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Demo Walkthrough

1. **Type a message** mentioning assets, failures, or schedules:
   - `"Tell me about engine telemetry"` → binds engine data models
   - `"What about failure damage?"` → maps iof:ImpactDamage concept
   - `"Show maintenance schedules"` → links work order tables

2. **Watch the thinking cards** — holographic panels expand showing ontology scans and DataHub queries with loading animations.

3. **Check the HUD** — the right sidebar populates with color-coded ontology tags and data model health indicators in real time.

4. **After 4 exchanges**, the view transitions to the **Holographic Blueprint** — an interactive node graph. Hover over Action nodes for a digital glitch effect.

5. **Click COMPILE WORKFLOW** in the sidebar to simulate the final deployment and system online state.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18+, Vite 7, TypeScript 5.9 |
| Styling | Tailwind CSS v4 (custom neon theme) |
| Animation | Framer Motion |
| State | Zustand |
| Data Fetching | TanStack Query + axios |
| Graph | @xyflow/react (React Flow v12) |
| Markdown | react-markdown |
| Icons | Lucide React |
| Fonts | JetBrains Mono, Inter |

## Project Structure

```
src/
├── api/                    # API client, stream parser, types
├── store/                  # Zustand store (messages, phase, ontology, bindings)
├── hooks/                  # useAgent (handles mock logic), useCompileWorkflow
├── components/
│   ├── NeuralStream/       # Chat UI: messages, thinking cards, RadarReveal, AgentTeamLoader
│   ├── HUD/                # Sidebar: ontology map, data bindings
│   ├── Blueprint/          # React Flow: custom nodes, animated edges
│   └── Compilation/        # Compile button, matrix code overlay
```

The app has three primary phases controlled by a Zustand store:

```
active → blueprint → complete
```

- **active** — Application simulates an interview with an AI agent mesh. Real-time "Thinking Cards" reflect the execution stages. Animated persona icons appear during fan-out ("Agents Assembling").
- **blueprint** — **Composite Dashboard** phase. The system displays a `DashboardUI` with multiple components. The `SemanticInterpreter` renders each with staggered `RadarReveal` animations in a responsive CSS Grid. Graphs and docs span full width; cards flow inline.
- **complete** — Final deployment and system online state.

The frontend uses a **facade pattern** (`useAgent`) that currently defaults to a mock implementation for demo consistency.

## Environment Variables

**Frontend** (`.env` at project root):
```env
# The ONLY var the frontend needs. No secrets here.
VITE_API_URL=http://localhost:8000
```

## API & Backend Integration

The React app communicates with the FastAPI BFF through three primary endpoints:

1. **`GET /health`**: System connectivity check used by `useAgent` to monitor backend health.
2. **`POST /interview/stream`**: Long-lived **Server-Sent Events (SSE)** stream for real-time agent responses (thinking cards, persona reveals, and final dashboard delivery).
3. **`POST /workflow/compile`**: REST endpoint used to submit the generated BPMN mesh for deployment and cataloging.

## Scripts

```bash
npm run dev        # Start dev server
npm run build      # Production build (tsc + vite)
npm run preview    # Preview production build
npx tsc --noEmit   # Type-check only
```

## AI-Friendly Docs

| File | Purpose |
|------|---------|
| `llms.txt` | Full architecture, file map, and patterns for AI assistants |
| `.cursorrules` | Coding style, tech stack constraints, do/don't rules |
| `AGENTS.md` | AI agent workflow guide, safety guardrails, extension patterns |

## License

MIT
