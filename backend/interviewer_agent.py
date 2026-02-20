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

Modes:
  - BAML (real LLM via OpenRouter) — when OPENROUTER_API_KEY is set
  - Mock (keyword-based)           — when no API key is set
"""

import asyncio
import logging
import os
import uuid
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


logger = logging.getLogger("cortex")

# ── Env ───────────────────────────────────────────────────
load_dotenv()

_USE_BAML = bool(os.getenv("OPENROUTER_API_KEY"))
_ONTOLOGY_URL = os.getenv("ONTOLOGY_SERVICE_URL", "http://localhost:8084")
_DATAHUB_URL = os.getenv("DATAHUB_SERVICE_URL", "http://localhost:8085")

if _USE_BAML:
    from baml_client import b  # type: ignore[import-untyped]


# ── App ───────────────────────────────────────────────────
app = FastAPI(title="The Cortex — Interrogator Agent", version="2.0.0")

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


# ── Session State ─────────────────────────────────────────
_session_msg_count: dict[str, int] = {}
_session_history: dict[str, list[str]] = {}


# ══════════════════════════════════════════════════════════
# Live Data Layer (server-to-server only)
# ══════════════════════════════════════════════════════════

_MOCK_ONTOLOGY = (
    "iof:VisualInspection, iof:UsageBasedMaintenance, iof:Overhaul, "
    "iof:FailureMode, iof:RotatingEquipment, iof:ImpactDamage, "
    "iof:MaintenanceSchedule, iof:Asset, iof:InspectionRecord, "
    "iof:WorkOrder, iof:Sensor"
)
_MOCK_DATA_SOURCES = (
    "dbt.stg_engine_telemetry, dbt.stg_maintenance_logs, "
    "dbt.stg_sensor_readings, dbt.dim_failure_modes, "
    "dbt.dim_assets, dbt.fct_work_orders, dbt.fct_inspections"
)


async def get_live_ontology() -> str:
    """Fetch real ontology classes from the Ontology Microservice.
    Falls back to mock data when the service is offline."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_ONTOLOGY_URL}/classes")
            resp.raise_for_status()
            return resp.json().get("available_classes", _MOCK_ONTOLOGY)
    except Exception as exc:
        logger.warning("Ontology service offline (%s), using mock data", exc)
        return _MOCK_ONTOLOGY


async def get_live_data_sources() -> str:
    """Fetch real dbt models from the DataHub wrapper service.
    Falls back to mock data when the service is offline."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_DATAHUB_URL}/tables")
            resp.raise_for_status()
            return resp.json().get("available_tables", _MOCK_DATA_SOURCES)
    except Exception as exc:
        logger.warning("DataHub service offline (%s), using mock data", exc)
        return _MOCK_DATA_SOURCES


# ══════════════════════════════════════════════════════════
# BAML Streaming (real LLM via OpenRouter)
# ══════════════════════════════════════════════════════════


def _build_chat_history(session_id: str) -> str:
    """Format session history as a single string for the BAML prompt."""
    turns = _session_history.get(session_id, [])
    return "\n".join(turns) if turns else "(no previous conversation)"


def _ontology_category(uri: str) -> str:
    """Derive a human-readable category from an ontology URI."""
    lower = uri.lower()
    if "failure" in lower or "damage" in lower:
        return "Concept"
    if "schedule" in lower or "workorder" in lower or "maintenance" in lower:
        return "Process"
    if "sensor" in lower or "inspection" in lower:
        return "Process"
    return "Asset"


def _guess_schema(model_name: str) -> str:
    """Guess staging/warehouse schema from dbt model naming convention."""
    if model_name.startswith("stg_"):
        return "staging"
    if model_name.startswith("dim_") or model_name.startswith("fct_"):
        return "warehouse"
    return "staging"


async def generate_baml_stream(
    request: InterviewRequest,
) -> AsyncGenerator[str, None]:
    """
    Stream an interview response using BAML + OpenRouter.

    Iterates over BAML's partial InterviewState objects, computing deltas
    and translating them into the <<TOKEN:...>> protocol the frontend expects.
    """
    session_id = request.session_id or "default"

    # Track exchanges
    _session_msg_count[session_id] = _session_msg_count.get(session_id, 0) + 1

    # Append user turn to history
    history = _session_history.setdefault(session_id, [])
    history.append(f"User: {request.message}")

    chat_history = _build_chat_history(session_id)

    # Fetch live grounding data from internal services
    ontology_classes, data_sources = await asyncio.gather(
        get_live_ontology(),
        get_live_data_sources(),
    )

    # ── Stream via BAML ──
    stream = b.stream.ConductInterview(
        chat_history=chat_history,
        user_message=request.message,
        available_ontology_classes=ontology_classes,
        available_data_sources=data_sources,
    )

    prev_reply = ""
    prev_ontology: str | None = None
    prev_dbt: str | None = None
    prev_ready = False

    async for partial in stream:
        # ── Text delta ──
        current_reply = partial.agent_reply or ""
        if len(current_reply) > len(prev_reply):
            delta = current_reply[len(prev_reply) :]
            yield delta
            prev_reply = current_reply

        # ── Ontology class transition (None → value) ──
        current_ontology = partial.ontology_class
        if current_ontology and current_ontology != prev_ontology:
            label = current_ontology.split(":")[-1] if ":" in current_ontology else current_ontology
            category = _ontology_category(current_ontology)
            yield f"\n<<ONTOLOGY_LOOKUP:{label}>>\n"
            yield f"<<ONTOLOGY_FOUND:{category}:{current_ontology}>>\n"
            prev_ontology = current_ontology

        # ── dbt model transition (None → value) ──
        current_dbt = partial.dbt_model
        if current_dbt and current_dbt != prev_dbt:
            schema = _guess_schema(current_dbt)
            yield f"\n<<DATAHUB_QUERY:{current_dbt}:{schema}>>\n"
            yield f"<<DATAHUB_RESULT:{current_dbt}:{schema}:true>>\n"
            prev_dbt = current_dbt

        # ── Ready to compile ──
        current_ready = partial.is_ready_to_compile or False
        if current_ready and not prev_ready:
            yield "\n<<INTERVIEW_COMPLETE>>\n"
            prev_ready = current_ready

    # Get final response and save assistant turn to history
    final = await stream.get_final_response()
    history.append(f"Agent: {final.agent_reply}")

    yield "\n<<STREAM_END>>\n"


# ══════════════════════════════════════════════════════════
# Mock Streaming (keyword-based fallback)
# ══════════════════════════════════════════════════════════


async def _stream_text(text: str, chunk_size: int = 3, delay: float = 0.02):
    """Yield text in small chunks to simulate streaming."""
    for i in range(0, len(text), chunk_size):
        yield text[i : i + chunk_size]
        await asyncio.sleep(delay)


async def generate_mock_stream(
    request: InterviewRequest,
) -> AsyncGenerator[str, None]:
    """
    Keyword-based mock stream — used when OPENROUTER_API_KEY is not set.
    Demonstrates the streaming token protocol without an LLM.
    """
    session_id = request.session_id or "default"
    msg = request.message.lower()

    _session_msg_count[session_id] = _session_msg_count.get(session_id, 0) + 1
    msg_count = _session_msg_count[session_id]

    if "engine" in msg or "turbine" in msg:
        yield "<<ONTOLOGY_LOOKUP:RotatingEquipment>>\n"
        await asyncio.sleep(0.8)
        yield "<<ONTOLOGY_FOUND:Asset:Engine>>\n"
        await asyncio.sleep(0.3)
        yield "<<ONTOLOGY_FOUND:Concept:iof:RotatingEquipment>>\n"
        await asyncio.sleep(0.5)

        yield "<<DATAHUB_QUERY:stg_engine_telemetry:staging>>\n"
        await asyncio.sleep(1.0)
        yield "<<DATAHUB_RESULT:stg_engine_telemetry:staging:true>>\n"
        await asyncio.sleep(0.3)

        text = (
            "I've identified the engine as a Rotating Equipment asset in "
            "the IOF-MRO ontology. The telemetry data is available through "
            "the stg_engine_telemetry model in DataHub. This model captures "
            "vibration signatures, temperature readings, and RPM data. "
            "Shall I bind this to the workflow?"
        )
        async for chunk in _stream_text(text):
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
        async for chunk in _stream_text(text):
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
        async for chunk in _stream_text(text):
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
        async for chunk in _stream_text(text):
            yield chunk

    yield "\n"

    if msg_count >= 4:
        yield "<<INTERVIEW_COMPLETE>>\n"

    yield "<<STREAM_END>>\n"


# ══════════════════════════════════════════════════════════
# Endpoints
# ══════════════════════════════════════════════════════════


@app.post("/interview/stream")
async def interview_stream(request: InterviewRequest):
    """
    Streaming interview endpoint.
    Automatically selects BAML (real LLM) or mock based on OPENROUTER_API_KEY.
    Returns a chunked text/event-stream response with embedded special tokens.
    """
    generator = generate_baml_stream(request) if _USE_BAML else generate_mock_stream(request)
    return StreamingResponse(
        generator,
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

    return CompileResponse(
        success=True,
        run_id=run_id,
        dagster_job_name=job_name,
        message=f"Pipeline compiled successfully. {len(request.blueprint.nodes)} "
        f"nodes, {len(request.blueprint.edges)} edges. Dagster run initiated.",
    )


# ── BFF Proxy Routes ─────────────────────────────────────
# The frontend NEVER calls internal services directly.
# These endpoints proxy server-to-server requests.


@app.get("/ontology/classes")
async def proxy_ontology_classes():
    """BFF proxy: returns available ontology classes from the Ontology Service."""
    classes = await get_live_ontology()
    return {"available_classes": classes}


@app.get("/datahub/tables")
async def proxy_datahub_tables():
    """BFF proxy: returns available dbt models from the DataHub wrapper."""
    tables = await get_live_data_sources()
    return {"available_tables": tables}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "cortex-interrogator",
        "mode": "baml" if _USE_BAML else "mock",
    }
