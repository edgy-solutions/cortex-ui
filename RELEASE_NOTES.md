# Release Notes - v0.1.0

## New Features & Enhancements

* **Smart Chart Archetype Integration:** Added high-fidelity BI capabilities to the Cortex UI. The AI Mesh can now visualize asset data and maintenance trends directly in the chat stream using `recharts` for responsive Bar and Line charts with "Neon Glass" aesthetics.
* **Engine A (Analyst) Bridge:** Added a new `publishToSuperset` workflow in the API client targeting the Analyst Service's `/analyze` endpoint.
* **Real-time Feedback System:** Implemented a global toast notification system using `sonner` for status updates (e.g., "Publishing...") and quick links to Superset dashboards.
* **Optimized Rendering:** Used `useMemo` for JSON data parsing to ensure smooth chart rendering during rapid agent throughput.

## Bug Fixes & Stability

* **SSE Stream Looping Fix:** Fixed an issue where dropped or finished connections would cause `@microsoft/fetch-event-source` to automatically reconnect and spawn duplicate Dagster jobs. Added an `AbortController` to cleanly stop the stream on `stream_end` and an `onclose()` handler to fail gracefully.
* **SSE 401 Unauthorized Handling:** Added a custom `onopen` handler to intercept HTTP errors (like 401) before the SSE library checks the content-type, preventing generic crashes. The UI now correctly alerts the user and redirects to login when the session expires.
* **Dagster Retry Fix:** Disabled unnecessary retries for Dagster to improve reliability and reduce duplicate executions.

## Architecture & Data Contracts

* **Shift-Left Data Contract (Backend & BAML):** Overhauled the data contract between the Analyst Agent (Engine A) and the Presentation Agent (Engine F).
  * Updated `contracts.baml` to add a `structured_data` field to the `AgentResponse` schema.
  * Injected the strict `AgentFinalResponse` Pydantic schema into the agent's system prompt to separate conversational responses from structured data.
  * The Restate handler now safely parses and extracts `summary_text` for chat history while passing clean `structured_data` to the BAML payload.

## CI/CD

* **Release Container Builds:** Updated the `.github/workflows/build.yml` workflow to support tag releases. The workflow now triggers on tags starting with `v` (e.g., `v0.1.0`) and dynamically tags the Docker image with the extracted version number.
