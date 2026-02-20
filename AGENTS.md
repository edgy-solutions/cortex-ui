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

### Adding new features

- **New chat responses**: Add keyword patterns in `src/hooks/useMockAgent.ts` → `getResponseForInput()` for offline mode, and in `backend/interviewer_agent.py` → `generate_interview_stream()` for the real backend.
- **New node types**: Create in `src/components/Blueprint/nodes/`, register in `WorkflowCanvas.tsx` `nodeTypes` object.
- **New edge types**: Create in `src/components/Blueprint/edges/`, register in `WorkflowCanvas.tsx` `edgeTypes` object.
- **New HUD sections**: Add as a component in `src/components/HUD/` and render in `HUD.tsx`.
- **New interview phases**: Update `InterviewPhase` type in the store, then update `App.tsx` view switching and `HUD.tsx` conditional rendering.

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

## Key Files to Understand

| Purpose | File |
|---|---|
| App state & types | `src/store/useInterviewStore.ts` |
| Unified agent hook | `src/hooks/useAgent.ts` |
| Real API streaming | `src/hooks/useInterviewAgent.ts` |
| Mock agent fallback | `src/hooks/useMockAgent.ts` |
| Compile mutation | `src/hooks/useCompileWorkflow.ts` |
| API client + stream parser | `src/api/client.ts` |
| Stream token protocol | `src/api/types.ts` |
| Workflow graph generation | `src/hooks/useMockWorkflowBuilder.ts` |
| Phase-based view switching | `src/App.tsx` |
| Global theme & CSS | `src/index.css` |
| Backend API | `backend/interviewer_agent.py` |

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
```
