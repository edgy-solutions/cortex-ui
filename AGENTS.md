# AGENTS.md — AI Agent Guide for The Cortex

## Project Summary

The Cortex is a cinematic React UI for an AI Agent mesh interrogator. It connects to a FastAPI backend for real-time streaming, but gracefully falls back to mock mode when the backend is unavailable. The aesthetic is "Dark Glass & Neon" (cyberpunk control center).

## Development Workflow

### Before making changes

1. Read `llms.txt` for the full file map and architecture overview.
2. Read `.cursorrules` for coding conventions and constraints.
3. Check the current `InterviewPhase` flow: `active` → `blueprint` → `compiling` → `complete`.

### Making changes

1. **Run TypeScript check** before and after edits: `npx tsc --noEmit`
2. **Run Vite build** to verify bundling: `npx vite build`
3. **Test visually** with `npm run dev` — this is a UI-heavy project where visual correctness matters.
4. Keep all styling in Tailwind classes or `src/index.css`. Do not create new CSS files.
5. When adding new components, place them in the appropriate feature directory under `src/components/`.

- **New chat responses**: Responses no longer flow through BAML. The `interviewer_agent.py` acts as a proxy to the Dagster `supervisor_query_job`. The UI uses a `SemanticInterpreter` to decode `DashboardUI` payloads (containing an array of `SemanticUIContainer` components) into high-fidelity composite dashboards.
- **New node types**: Create in `src/components/Blueprint/nodes/`, register in `WorkflowCanvas.tsx` `nodeTypes` object.
- **New edge types**: Create in `src/components/Blueprint/edges/`, register in `WorkflowCanvas.tsx` `edgeTypes` object.
- **New HUD sections**: Add as a component in `src/components/HUD/` and render in `HUD.tsx`.
- **New interview phases**: Update `InterviewPhase` type in the store, then update `App.tsx` view switching and `HUD.tsx` conditional rendering.
- **New BPMN task types**: Add to `BPMNTask.type` union in both `src/api/types.ts` (frontend) and `BPMNTask` Pydantic model in `backend/interviewer_agent.py`. Update the node-to-task mapping in `src/hooks/useCompileWorkflow.ts`.
- **New gateway types**: Add to `BPMNGateway.type` union in both frontend types and backend Pydantic model.
- **Database schema changes**: Add a new SQL migration file in `backend/sql/` (numbered sequentially, e.g. `002_*.sql`). Update `backend/models.py` to match. Run the SQL against the `iagent` database.
- **Boot sequence customization**: Edit `synthesize_boot_sequence()` in `backend/interviewer_agent.py`. Do not hardcode boot log text in frontend components.

## Safety & Guardrails

### Do NOT

- **Do not bypass the API layer.** All backend calls go through `src/api/client.ts`. Components use `useAgent()`, not raw fetch/axios.
- **Do not expose secrets to the frontend.** API keys, internal service URLs, and credentials belong ONLY in `backend/.env`. The frontend `.env` must contain nothing but `VITE_API_URL`.
- **Do not call internal services from the frontend.** The React app talks ONLY to the FastAPI BFF (port 8000). If the frontend needs data from the ontology service or DataHub, add a BFF proxy route in the backend.
- **Do not remove mock fallback.** The `useMockAgent` hook must stay functional for offline demos.
- **Do not install additional state management libraries.** Zustand is the single source of truth.
- **Do not modify the build toolchain** (Vite config, TypeScript config) without explicit instruction.
- **Do not remove the glass-panel aesthetic.** The visual theme is a core requirement — all panels must use glassmorphism (`backdrop-blur`, translucent backgrounds, neon borders).
- **Do not use default React Flow node styles.** All nodes must use custom glassmorphism components.
- **Do not commit `node_modules/` or `dist/`.** Both are in `.gitignore`.

### Be careful with

- **Animation performance**: Framer Motion animations on many elements can cause jank. Use `memo()` on React Flow nodes. Avoid animating layout properties on large lists.
- **Zustand store updates during streaming**: The mock agent updates the store rapidly during character-by-character streaming. Ensure new subscribers use selectors to avoid unnecessary re-renders.
- **React Flow re-renders**: Node and edge type objects must be defined outside components (module-level `const`) to prevent React Flow from re-mounting nodes on every render.

| Purpose | File |
|---|---|
| App state & types | `src/store/useInterviewStore.ts` |
| Unified agent hook | `src/hooks/useAgent.ts` |
| Real API proxy/stream | `src/hooks/useInterviewAgent.ts` |
| Mock agent fallback | `src/hooks/useMockAgent.ts` |
| Compile mutation | `src/hooks/useCompileWorkflow.ts` |
| BPMN type definitions | `src/api/types.ts` |
| API client + SSE parser | `src/api/client.ts` |
| Semantic Interpreter | `src/components/registry/SemanticInterpreter.tsx` |
| Radar Reveal Animation | `src/components/NeuralStream/RadarReveal.tsx` |
| Agent Team Loader | `src/components/NeuralStream/AgentTeamLoader.tsx` |
| SSE event protocol | `src/api/types.ts` |
| Workflow graph generation | `src/hooks/useMockWorkflowBuilder.ts` |
| Phase-based view switching | `src/App.tsx` |
| Global theme & CSS | `src/index.css` |
| Backend Orchestrator Proxy | `backend/interviewer_agent.py` |
| Live Bpmn → React Flow hook | `src/hooks/useLiveBpmnGraph.ts` |
| Database session layer | `backend/database.py` |
| BPMN catalog ORM model | `backend/models.py` |
| Database schema DDL | `backend/sql/001_create_bpmn_catalog.sql` |

## Testing

No test framework is currently set up. Visual testing is done via `npm run dev`. To verify correctness:

1. Run through the full demo flow: type 4 messages → blueprint appears → compile → system online.
2. Check that ontology terms and data bindings populate in the HUD.
3. Verify animations are smooth (no jank on thinking cards, typewriter, node entrance).
4. Hover over Action nodes in the blueprint to confirm glitch effect.

## Commands

```bash
# Frontend
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Production build (tsc + vite build)
npm run preview    # Preview production build
npx tsc --noEmit   # Type-check without emitting

# Backend (optional)
cd backend
uv sync
uv run uvicorn interviewer_agent:app --reload --port 8000

# Database (required for BPMN catalog)
# Ensure PostgreSQL is running with the iagent database:
psql -h localhost -U iagent -d iagent -f backend/sql/001_create_bpmn_catalog.sql
```

- The compile endpoint (`POST /workflow/compile`) does three things in sequence:
  1. **Upserts** the BPMN payload to the `bpmn_catalog` Postgres table
  2. **Reloads** the Dagster workspace via GraphQL (non-fatal on failure)
  3. **Returns** a `boot_log` terminal string for the CompilationOverlay
- The `CompilationOverlay` renders the `boot_log` line-by-line with color-coded syntax highlighting. Do not hardcode boot log content in the frontend.
- React Flow's `WorkflowCanvas.tsx` acts as a **Dumb Renderer** for the final Agent Mesh instructions. It either renders BPMN domain data mapped via `useLiveBpmnGraph.ts` or raw React Flow nodes/edges if provided directly by Engine F.
- The `bpmn_catalog` table is shared with the `invincible-agent` Dagster backend. Both services use the same Postgres database (`iagent`). Do not change the schema without coordinating with that project.
- `DATABASE_URL` and `DAGSTER_WEBSERVER_URL` are configured in `backend/.env`.

## SSE Stream Protocol

- The backend (`interviewer_agent.py`) proxies the Dagster `supervisor_query_job`.
- It streams real-time `status` events derived from Dagster `stepStats`. These drive the **Holographic Thinking Cards** on the frontend.
- `action: "think"` → Displays a loading card with the provided `label`.
- `action: "found"` → Marks the loading card as 'Done' and updates the `label` with the result.
- `action: "plan"` → Carries a `personas` array. Triggers the **Agent Team Loader** (animated persona icons during fan-out).
- `action: "error"` → Displays a `WarningCard` in the stream.
- Upon successful execution of the Agent Mesh, a `final_payload` event carries a `DashboardUI` object.

## Composite Dashboard (`DashboardUI`)

The `final_payload` is a `DashboardUI` object: `{ components: SemanticUIContainer[] }`.
The `SemanticInterpreter` iterates over `components`, rendering each with a staggered `RadarReveal` animation in a CSS Grid.

**Layout Rules:**
- `PROCESS_TOPOLOGY` and `KNOWLEDGE_DOCUMENT` → `col-span-full` (full width).
- `HAZARD_DECLARATION` and `ASSET_STATE_METRIC` → `col-span-1` (inline, 2-col grid on md+).

**RadarReveal Animation (3 phases):**
1. Horizontal neon scan line expands from center.
2. Container height expands via CSS Grid `grid-rows-[1fr]`.
3. Content fades in with upward translate.
Each component is staggered by `index * 400ms`.

## Archetypes
- **`PROCESS_TOPOLOGY`**: Full-width React Flow graph (nodes + edges). Triggers `blueprint` phase.
- **`HAZARD_DECLARATION`**: Inline `WarningCard` with severity badges and hazard entity lists.
- **`ASSET_STATE_METRIC`**: Inline `SupplyTable` showing Entity/Type/Detail columns (maps `UIEntity.name`, `.type`, `.description`).
- **`KNOWLEDGE_DOCUMENT`**: Full-width Markdown rendered via `react-markdown`.

## Personas

The backend broadcasts active personas during Dagster fan-out via `AssetMaterialization`. The frontend displays animated persona icons in the `AgentTeamLoader` component.

- **MECHANIC** — Wrench icon (amber). Safety hazards, tool requirements.
- **TECH_WRITER** — BookOpen icon (blue). Technical procedure documentation.
- **LOGISTICS** — Truck icon (emerald). Supply chain and platform impact.
- **AUDITOR** — ShieldCheck icon (red). Compliance violations, audit reports.
- **PROCESS_ENGINEER** — Network icon (purple). Workflow graphs, process steps.
