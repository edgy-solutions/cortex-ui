# The Cortex — Interrogator Interface

A cinematic **"Dark Glass & Neon"** control center for interrogating an autonomous AI Agent mesh. Think futuristic mission control — not a corporate dashboard.

The Cortex lets you converse with an AI agent mesh that iteratively builds a BPMN workflow graph. The system delegates orchestration to a Dagster-driven Polyglot Mesh, which scans industrial ontologies (IOF-MRO), binds data models, and compiles results into a scalable pipeline — all with a cyberpunk aesthetic featuring glassmorphism panels, neon accents, typewriter streaming, and holographic visualizations.

## What It Does

**1. Neural Stream** — A streaming chat interface that proxies a Dagster/Mesh fleet. real-time "Thinking Cards" reflect the actual execution stages of the backend agents (Engine O, Engine E, Engine F).

**2. Live Context HUD** — A real-time sidebar that accumulates extracted ontology concepts (e.g. `Asset: Engine`, `Concept: iof:ImpactDamage`) and identified data models with health indicators.

**3. Holographic Blueprint** — After enough context is gathered, the UI transitions to an interactive React Flow node graph showing the generated workflow: Trigger nodes → Logic nodes → Action nodes, with animated pulsing edges.

**4. Compilation Sequence** — Clicking "Compile Workflow" sends the React Flow graph to the backend as a BPMN payload (tasks, gateways, sequence flows). The backend upserts it to the `bpmn_catalog` Postgres table, reloads the Dagster workspace, and returns a terminal boot log that plays back in a full-screen overlay — complete with `[AGENT] Provisioning task: ...` lines — ending with **SYSTEM ONLINE**.

**5. BPMN Catalog** — Saved workflows are persisted in PostgreSQL and shared with the `invincible-agent` Dagster backend, which dynamically generates pipeline jobs from the stored BPMN models.

## Quick Start

The frontend works standalone with a built-in mock agent — no backend required.

```bash
git clone <repo-url>
cd process-spawner
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### With the Backend (Optional)

Start the FastAPI backend to switch from mock mode to real streaming. The UI auto-detects the backend and shows a green wifi icon in the input bar when connected.

```bash
# Terminal 1 — Backend
cd backend
uv sync
uv run uvicorn interviewer_agent:app --reload --port 8000

# Terminal 2 — Frontend
npm run dev
```

## Demo Walkthrough

1. **Type a message** mentioning assets, failures, or schedules:
   - `"Tell me about engine telemetry"` → binds engine data models
   - `"What about failure damage?"` → maps iof:ImpactDamage concept
   - `"Show maintenance schedules"` → links work order tables
   - Any other text → prompts for more context

2. **Watch the thinking cards** — holographic panels expand showing ontology scans and DataHub queries with loading animations.

3. **Check the HUD** — the right sidebar populates with color-coded ontology tags and data model health indicators in real time.

4. **After 4 exchanges**, the view transitions to the **Holographic Blueprint** — an interactive node graph. Hover over Action nodes for a digital glitch effect.

5. **Click COMPILE WORKFLOW** in the sidebar — the system saves the BPMN model to Postgres, reloads Dagster, and plays a terminal boot sequence overlay showing each provisioned agent task — then displays **SYSTEM ONLINE**.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18+, Vite 7, TypeScript 5.9 |
| Styling | Tailwind CSS v4 (custom neon theme) |
| Animation | Framer Motion |
| State | Zustand |
| Data Fetching | TanStack Query + axios |
| Graph | @xyflow/react (React Flow v12) |
| Icons | Lucide React |
| Fonts | JetBrains Mono, Inter |
| Backend | FastAPI (Python), StreamingResponse |
| LLM Orchestration | Dagster / Polyglot Mesh |
| Python Tooling | uv (package manager), httpx, FastAPI |

## Project Structure

```
src/
├── api/                    # API client, stream parser, types
├── store/                  # Zustand store (messages, phase, ontology, bindings)
├── hooks/                  # useAgent (auto-switches real/mock), useCompileWorkflow
├── components/
│   ├── NeuralStream/       # Chat UI: messages, thinking cards, input bar
│   ├── HUD/                # Sidebar: ontology map, data bindings
│   ├── Blueprint/          # React Flow: custom nodes, animated edges
│   └── Compilation/        # Compile button, matrix code overlay
backend/
├── pyproject.toml           # Python deps (managed by uv)
├── interviewer_agent.py     # FastAPI BFF gateway: streaming, compile (upsert + Dagster reload), BPMN catalog
├── database.py              # Async SQLAlchemy engine + get_db() dependency
├── models.py                # SQLAlchemy ORM model for bpmn_catalog table
├── sql/
│   └── 001_create_bpmn_catalog.sql  # DDL: bpmn_catalog table + trigger + index
├── baml_src/                # BAML definitions (LLM contract + OpenRouter client)
├── .env                     # Backend secrets + DATABASE_URL + DAGSTER_WEBSERVER_URL
└── .env.example             # Template for backend env vars
```

The app has three primary phases controlled by a Zustand store:

```
active → blueprint → complete
```

- **active** — Application proxies prompts to the Dagster `supervisor_query_job`. Real-time SSE status events drive the thinking visualizations.
- **blueprint** — **Semantic Interpreter** phase. The frontend decodes the backend's "Semantic Intent" payload (Archetypes: Topology, Hazards, Metrics, Docs) into high-fidelity React components.
- **complete** — Final deployment and system online state.

The frontend uses a **facade pattern** (`useAgent`) that health-checks the backend gateway. If the mesh is online, it uses live SSE streaming. If not, it falls back to a mock implementation for demo consistency.

The backend acts as a **Dagster Proxy (BFF)** — it triggers the supervisor job, polls for step stats, and transforms internal mesh signals into frontend-ready SSE events.

## Environment Variables

**Frontend** (`.env` at project root):
```env
# The ONLY var the frontend needs. No secrets here.
VITE_API_URL=http://localhost:8000
```

**Backend** (`backend/.env` — server-side only):
```env
OPENROUTER_API_KEY=sk-or-...     # Omit for mock mode
ONTOLOGY_SERVICE_URL=http://localhost:8084
DATAHUB_SERVICE_URL=http://localhost:8085
DATABASE_URL=postgresql+asyncpg://iagent:iagent@localhost:5432/iagent
DAGSTER_WEBSERVER_URL=http://localhost:3000
```

### Database Setup (for BPMN Catalog)

The BPMN catalog requires a PostgreSQL database. The default connection matches the `invincible-agent` Dagster backend:

```bash
# Create the database and user (if not already done)
createdb -U postgres iagent
psql -U postgres -d iagent -c "CREATE USER iagent WITH PASSWORD 'iagent';"
psql -U postgres -d iagent -c "GRANT ALL PRIVILEGES ON DATABASE iagent TO iagent;"

# Create the bpmn_catalog table
psql -h localhost -U iagent -d iagent -f backend/sql/001_create_bpmn_catalog.sql
```

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
