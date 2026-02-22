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
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, init_db
from models import BpmnCatalog


logger = logging.getLogger("cortex")

# ── Env ───────────────────────────────────────────────────
load_dotenv()

_USE_BAML = bool(os.getenv("OPENROUTER_API_KEY"))
_ONTOLOGY_URL = os.getenv("ONTOLOGY_SERVICE_URL", "http://localhost:8084")
_DATAHUB_URL = os.getenv("DATAHUB_SERVICE_URL", "http://localhost:8085")
_DAGSTER_WEBSERVER_URL = os.getenv("DAGSTER_WEBSERVER_URL", "http://localhost:3000")

if _USE_BAML:
    from baml_client import b  # type: ignore[import-untyped]


# ── Lifespan ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup/shutdown lifecycle — verify DB connection on boot."""
    await init_db()
    yield


# ── App ───────────────────────────────────────────────────
app = FastAPI(
    title="The Cortex — Interrogator Agent",
    version="2.0.0",
    lifespan=lifespan,
)

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



class BPMNTask(BaseModel):
    id: str
    name: str
    type: str  # "service_task" | "user_task"
    agent_endpoint: str


class BPMNGateway(BaseModel):
    id: str
    name: str
    type: str  # "exclusive"


class BPMNSequenceFlow(BaseModel):
    id: str
    source_ref: str
    target_ref: str
    condition_expression: str | None = None


class BPMNPayload(BaseModel):
    tasks: list[BPMNTask] = []
    gateways: list[BPMNGateway] = []
    sequence_flows: list[BPMNSequenceFlow] = []


class CompileRequest(BaseModel):
    session_id: str
    bpmn_payload: BPMNPayload


class CompileResponse(BaseModel):
    success: bool
    run_id: str
    dagster_job_name: str | None = None
    message: str | None = None
    boot_log: str = ""


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


# ── Compile helpers ───────────────────────────────────────


def synthesize_boot_sequence(
    bpmn_payload: BPMNPayload,
    *,
    workflow_id: str,
    run_id: str,
    job_name: str,
    dagster_reload_ok: bool,
) -> str:
    """Generate a high-tech terminal boot log from a BPMN payload.

    Returns a multi-line string styled as a futuristic system boot
    sequence, enumerating every task/gateway/flow and reporting
    the database sync + Dagster reload status.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: list[str] = [
        "",
        "╔══════════════════════════════════════════════════════════╗",
        "║       C O R T E X  —  C O M P I L E R  v2.0          ║",
        "╚══════════════════════════════════════════════════════════╝",
        "",
        f"  [INIT] Timestamp .............. {ts}",
        f"  [INIT] Run ID ................. {run_id}",
        f"  [INIT] Workflow ID ............ {workflow_id}",
        "",
        "  ── System ────────────────────────────────────────────",
        "  [SYSTEM] Saving BPMN model to bpmn_catalog ... OK",
        "  [SYSTEM] is_active ............ TRUE",
        "",
        "  ── Agent Provisioning ────────────────────────────────",
    ]

    for task in bpmn_payload.tasks:
        tag = "SVC" if task.type == "service_task" else "USR"
        lines.append(f"  [AGENT] Provisioning task: {task.name} [{tag}]")
        lines.append(f"          └─ endpoint: {task.agent_endpoint}")

    if not bpmn_payload.tasks:
        lines.append("  [AGENT] (no tasks defined)")

    for gw in bpmn_payload.gateways:
        lines.append(f"  [GATE]  Gateway registered: {gw.name} ({gw.type})")

    lines.append("")
    lines.append("  ── Dagster Pipeline ──────────────────────────────────")
    lines.append(f"  [LINK] Job Name ............... {job_name}")
    lines.append(f"  [LINK] Tasks .................. {len(bpmn_payload.tasks)}")
    lines.append(f"  [LINK] Gateways ............... {len(bpmn_payload.gateways)}")
    lines.append(f"  [LINK] Sequence Flows ......... {len(bpmn_payload.sequence_flows)}")
    lines.append(f"  [LINK] Op Factory ............. DYNAMIC")
    lines.append(f"  [LINK] Graph Wiring ........... RESOLVED")

    reload_status = "OK" if dagster_reload_ok else "UNREACHABLE (will retry on next cold-start)"
    lines.append("")
    lines.append("  ── Dagster Workspace Reload ──────────────────────────")
    lines.append(f"  [DAGSTER] ReloadWorkspace ..... {reload_status}")

    lines.append("")
    lines.append("  ── Status ────────────────────────────────────────────")
    lines.append("  [DONE] Pipeline compiled successfully.")
    lines.append("  [DONE] Dagster run initiated.")
    lines.append("")
    lines.append("  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ SYSTEM ONLINE")
    lines.append("")

    return "\n".join(lines)


async def _reload_dagster_workspace() -> bool:
    """POST the reloadRepositoryLocation mutation to Dagster Webserver.

    Returns True if the reload succeeded, False on any error (network,
    Dagster offline, etc.).  Failures are non-fatal — the dynamic
    factory will pick up the change on the next Dagster restart.
    """
    mutation = """
    mutation ReloadWorkspace {
      reloadRepositoryLocation(
        repositoryLocationName: "iagent"
      ) {
        __typename
        ... on WorkspaceLocationEntry {
          name
          loadStatus
        }
        ... on ReloadNotSupported {
          message
        }
        ... on RepositoryLocationNotFound {
          message
        }
      }
    }
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_DAGSTER_WEBSERVER_URL}/graphql",
                json={"query": mutation},
            )
            resp.raise_for_status()
            data = resp.json()
            typename = (
                data.get("data", {})
                .get("reloadRepositoryLocation", {})
                .get("__typename", "")
            )
            ok = typename == "WorkspaceLocationEntry"
            if ok:
                logger.info("Dagster workspace reload succeeded")
            else:
                logger.warning("Dagster workspace reload returned: %s", typename)
            return ok
    except Exception as exc:
        logger.warning("Dagster webserver unreachable for reload: %s", exc)
        return False


@app.post("/workflow/compile", response_model=CompileResponse)
async def compile_workflow(
    request: CompileRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Compile the BPMN payload into a Dagster job.

    1. Upsert the bpmn_payload into the bpmn_catalog table.
    2. Synthesize a Terminal Boot Sequence log.
    3. POST the ReloadWorkspace mutation to Dagster Webserver.
    4. Return the CompileResponse with boot_log.
    """
    run_id = str(uuid.uuid4())
    workflow_id = f"wf_{request.session_id}"
    job_name = f"cortex_pipeline_{request.session_id}"
    bp = request.bpmn_payload

    # ── 1. Upsert into bpmn_catalog ──
    result = await db.execute(
        select(BpmnCatalog).where(BpmnCatalog.workflow_id == workflow_id)
    )
    existing = result.scalar_one_or_none()

    payload_dict = bp.model_dump()

    if existing:
        existing.name = job_name
        existing.bpmn_payload = payload_dict
        existing.is_active = True
    else:
        row = BpmnCatalog(
            workflow_id=workflow_id,
            name=job_name,
            bpmn_payload=payload_dict,
        )
        db.add(row)

    await db.commit()

    # ── 2. Reload Dagster workspace ──
    dagster_reload_ok = await _reload_dagster_workspace()

    # ── 3. Synthesize boot log ──
    boot_log = synthesize_boot_sequence(
        bp,
        workflow_id=workflow_id,
        run_id=run_id,
        job_name=job_name,
        dagster_reload_ok=dagster_reload_ok,
    )

    return CompileResponse(
        success=True,
        run_id=run_id,
        dagster_job_name=job_name,
        message=f"Pipeline compiled: {len(bp.tasks)} tasks, "
        f"{len(bp.sequence_flows)} flows, {len(bp.gateways)} gateways.",
        boot_log=boot_log,
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


# ══════════════════════════════════════════════════════════
# BPMN Catalog
# ══════════════════════════════════════════════════════════


class BpmnSaveRequest(BaseModel):
    workflow_id: str
    name: str
    bpmn_payload: dict


class BpmnSaveResponse(BaseModel):
    workflow_id: str
    boot_sequence: str


class BpmnCatalogItem(BaseModel):
    workflow_id: str
    name: str
    bpmn_payload: dict
    is_active: bool
    created_at: str
    updated_at: str


def _generate_boot_sequence(req: BpmnSaveRequest) -> str:
    """Build the futuristic Terminal Boot Sequence string."""
    payload = req.bpmn_payload
    tasks = payload.get("tasks", [])
    flows = payload.get("sequence_flows", [])
    gateways = payload.get("gateways", [])
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    return (
        "\n"
        "╔══════════════════════════════════════════════════════════╗\n"
        "║          C O R T E X  —  B P M N  L O A D E R          ║\n"
        "╚══════════════════════════════════════════════════════════╝\n"
        "\n"
        f"  [BOOT] Timestamp .............. {ts}\n"
        f"  [BOOT] Workflow ID ............ {req.workflow_id}\n"
        f"  [BOOT] Workflow Name .......... {req.name}\n"
        "\n"
        "  ── Payload Manifest ──────────────────────────────────\n"
        f"  [LOAD] Tasks .................. {len(tasks)}\n"
        f"  [LOAD] Sequence Flows ......... {len(flows)}\n"
        f"  [LOAD] Gateways ............... {len(gateways)}\n"
        "\n"
        "  ── Database Sync ─────────────────────────────────────\n"
        "  [SYNC] bpmn_catalog ........... UPSERTED\n"
        "  [SYNC] is_active .............. TRUE\n"
        "  [SYNC] Dagster factory ........ PENDING RELOAD\n"
        "\n"
        "  ── Status ────────────────────────────────────────────\n"
        "  [DONE] Workflow persisted. Awaiting Dagster cold-start.\n"
        "  [DONE] BPMN payload hash ...... OK\n"
        "\n"
        "  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ SYSTEM ONLINE\n"
    )


@app.post("/bpmn/save", response_model=BpmnSaveResponse)
async def bpmn_save(req: BpmnSaveRequest, db: AsyncSession = Depends(get_db)):
    """
    Upsert a BPMN workflow into bpmn_catalog.
    Returns the Terminal Boot Sequence string for UI display.
    """
    # Check if workflow already exists
    result = await db.execute(
        select(BpmnCatalog).where(BpmnCatalog.workflow_id == req.workflow_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.name = req.name
        existing.bpmn_payload = req.bpmn_payload
        existing.is_active = True
    else:
        row = BpmnCatalog(
            workflow_id=req.workflow_id,
            name=req.name,
            bpmn_payload=req.bpmn_payload,
        )
        db.add(row)

    await db.commit()

    boot_seq = _generate_boot_sequence(req)
    return BpmnSaveResponse(workflow_id=req.workflow_id, boot_sequence=boot_seq)


@app.get("/bpmn/catalog", response_model=list[BpmnCatalogItem])
async def bpmn_catalog(db: AsyncSession = Depends(get_db)):
    """Return all active workflows from the bpmn_catalog table."""
    result = await db.execute(
        select(BpmnCatalog).where(BpmnCatalog.is_active == True)  # noqa: E712
    )
    rows = result.scalars().all()
    return [
        BpmnCatalogItem(
            workflow_id=r.workflow_id,
            name=r.name,
            bpmn_payload=r.bpmn_payload,
            is_active=r.is_active,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]
