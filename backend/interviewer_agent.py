"""
The Cortex — Interviewer Agent API
FastAPI service that bridges the React frontend to the Agent Mesh.

Endpoints:
  POST /interview/stream  — Streaming interview (chunked text + special tokens)
  POST /workflow/compile   — Compile blueprint into Dagster job
  GET  /health             — Health check

Special Stream Tokens:
  <<ONTOLOGY_LOOKUP:label>>                   — Ontology scan started
  <<ONTOLOGY_FOUND:category:label>>           — Concept found
  <<DATAHUB_QUERY:model:schema>>              — DataHub query started
  <<DATAHUB_RESULT:model:schema:healthy>>     — DataHub query result
  <<INTERVIEW_COMPLETE>>                      — Signal to transition to blueprint
  <<STREAM_END>>                              — End of stream
"""

import asyncio
import uuid
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


# ── App ───────────────────────────────────────────────────
app = FastAPI(title="The Cortex — Interrogator Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────
class InterviewContext(BaseModel):
    ontology_terms: list[dict] = []
    data_bindings: list[dict] = []


class InterviewRequest(BaseModel):
    message: str
    session_id: str | None = None
    context: InterviewContext | None = None


class CompileBlueprint(BaseModel):
    ontology_terms: list[dict]
    data_bindings: list[dict]
    nodes: list[dict]
    edges: list[dict]


class CompileRequest(BaseModel):
    session_id: str
    blueprint: CompileBlueprint


class CompileResponse(BaseModel):
    success: bool
    run_id: str
    dagster_job_name: str | None = None
    message: str | None = None


# ── Helpers ───────────────────────────────────────────────
# Session counter for triggering INTERVIEW_COMPLETE after enough exchanges
_session_msg_count: dict[str, int] = {}


async def stream_text(text: str, chunk_size: int = 3, delay: float = 0.02):
    """Yield text in small chunks to simulate streaming."""
    for i in range(0, len(text), chunk_size):
        yield text[i : i + chunk_size]
        await asyncio.sleep(delay)


async def generate_interview_stream(
    request: InterviewRequest,
) -> AsyncGenerator[str, None]:
    """
    Generate the interview response stream.

    This is where you would integrate with your actual LLM / ontology service.
    For now, it uses keyword-based mock logic similar to the frontend mock,
    but demonstrates the streaming token protocol.
    """
    session_id = request.session_id or "default"
    msg = request.message.lower()

    # Track message count per session
    _session_msg_count[session_id] = _session_msg_count.get(session_id, 0) + 1
    msg_count = _session_msg_count[session_id]

    # ── Determine response based on keywords ──
    if "engine" in msg or "turbine" in msg:
        # Ontology scan
        yield "<<ONTOLOGY_LOOKUP:RotatingEquipment>>\n"
        await asyncio.sleep(0.8)
        yield "<<ONTOLOGY_FOUND:Asset:Engine>>\n"
        await asyncio.sleep(0.3)
        yield "<<ONTOLOGY_FOUND:Concept:iof:RotatingEquipment>>\n"
        await asyncio.sleep(0.5)

        # DataHub query
        yield "<<DATAHUB_QUERY:stg_engine_telemetry:staging>>\n"
        await asyncio.sleep(1.0)
        yield "<<DATAHUB_RESULT:stg_engine_telemetry:staging:true>>\n"
        await asyncio.sleep(0.3)

        # Stream response text
        text = (
            "I've identified the engine as a Rotating Equipment asset in "
            "the IOF-MRO ontology. The telemetry data is available through "
            "the stg_engine_telemetry model in DataHub. This model captures "
            "vibration signatures, temperature readings, and RPM data. "
            "Shall I bind this to the workflow?"
        )
        async for chunk in stream_text(text):
            yield chunk

    elif "damage" in msg or "failure" in msg:
        yield "<<ONTOLOGY_LOOKUP:ImpactDamage>>\n"
        await asyncio.sleep(0.8)
        yield "<<ONTOLOGY_FOUND:Concept:iof:ImpactDamage>>\n"
        await asyncio.sleep(0.3)
        yield "<<ONTOLOGY_FOUND:Process:FailureMode>>\n"
        await asyncio.sleep(0.5)

        yield "<<DATAHUB_QUERY:stg_maintenance_logs:staging>>\n"
        await asyncio.sleep(1.0)
        yield "<<DATAHUB_RESULT:stg_maintenance_logs:staging:true>>\n"
        await asyncio.sleep(0.3)
        yield "<<DATAHUB_QUERY:dim_failure_modes:warehouse>>\n"
        await asyncio.sleep(0.8)
        yield "<<DATAHUB_RESULT:dim_failure_modes:warehouse:true>>\n"
        await asyncio.sleep(0.3)

        text = (
            "Impact damage events are tracked through the iof:ImpactDamage "
            "concept. I found maintenance log data in stg_maintenance_logs "
            "which correlates failure modes with inspection records. The data "
            "shows a 98.7% completeness score. Want me to add a failure "
            "prediction node?"
        )
        async for chunk in stream_text(text):
            yield chunk

    elif "schedule" in msg or "maintenance" in msg:
        yield "<<ONTOLOGY_LOOKUP:MaintenanceSchedule>>\n"
        await asyncio.sleep(0.8)
        yield "<<ONTOLOGY_FOUND:Process:MaintenanceSchedule>>\n"
        await asyncio.sleep(0.3)
        yield "<<ONTOLOGY_FOUND:Concept:iof:MaintenanceSchedule>>\n"
        await asyncio.sleep(0.5)

        yield "<<DATAHUB_QUERY:fct_work_orders:warehouse>>\n"
        await asyncio.sleep(1.0)
        yield "<<DATAHUB_RESULT:fct_work_orders:warehouse:true>>\n"
        await asyncio.sleep(0.3)

        text = (
            "Maintenance scheduling maps to iof:MaintenanceSchedule. I've "
            "linked it to the fct_work_orders fact table which tracks planned "
            "vs. actual maintenance windows. The current backlog shows 47 "
            "open work orders. Should I integrate this into the pipeline?"
        )
        async for chunk in stream_text(text):
            yield chunk

    else:
        yield "<<ONTOLOGY_LOOKUP:General>>\n"
        await asyncio.sleep(0.6)

        text = (
            f'I understand you\'re interested in "{request.message}". '
            "Let me map this to our data mesh. Could you provide more "
            "context? For example, mention specific assets (engines, "
            "turbines), failure modes, or maintenance schedules so I can "
            "bind the correct ontology concepts and data models."
        )
        async for chunk in stream_text(text):
            yield chunk

    yield "\n"

    # After 4 exchanges, signal interview complete
    if msg_count >= 4:
        yield "<<INTERVIEW_COMPLETE>>\n"

    yield "<<STREAM_END>>\n"


# ── Endpoints ─────────────────────────────────────────────
@app.post("/interview/stream")
async def interview_stream(request: InterviewRequest):
    """
    Streaming interview endpoint.
    Returns a chunked text/event-stream response with embedded special tokens.
    """
    return StreamingResponse(
        generate_interview_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/workflow/compile", response_model=CompileResponse)
async def compile_workflow(request: CompileRequest):
    """
    Compile the interview blueprint into a Dagster job.

    In production, this would:
    1. Generate Dagster asset definitions from the blueprint
    2. Submit a Dagster run
    3. Trigger the Restate service for agent orchestration
    4. Return the run_id for tracking

    For now, returns a mock success response.
    """
    run_id = str(uuid.uuid4())
    job_name = f"cortex_pipeline_{request.session_id}"

    # TODO: Integrate with Dagster and Restate here
    # dagster_client.submit_run(...)
    # restate_client.trigger_agent(...)

    return CompileResponse(
        success=True,
        run_id=run_id,
        dagster_job_name=job_name,
        message=f"Pipeline compiled successfully. {len(request.blueprint.nodes)} "
        f"nodes, {len(request.blueprint.edges)} edges. Dagster run initiated.",
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "cortex-interrogator"}
