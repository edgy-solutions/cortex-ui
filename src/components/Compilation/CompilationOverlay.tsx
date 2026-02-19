import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Code2 } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";

interface CompilationOverlayProps {
  onComplete: () => void;
}

// Mock Dagster / Python pipeline code
const MOCK_CODE = `
from dagster import job, op, repository, schedule
from dagster import AssetIn, asset, AssetOut
import pandas as pd

@asset(
    description="Ingest engine telemetry from IOT sensors",
    group_name="staging",
)
def stg_engine_telemetry() -> pd.DataFrame:
    """Load raw engine telemetry data."""
    return pd.read_parquet("s3://data-lake/raw/engine_telemetry/")

@asset(
    description="Maintenance logs with IOF-MRO ontology mapping",
    group_name="staging",
    ins={"upstream": AssetIn("stg_engine_telemetry")},
)
def stg_maintenance_logs(upstream: pd.DataFrame) -> pd.DataFrame:
    """Clean and map maintenance logs to iof:MaintenanceSchedule."""
    df = upstream.copy()
    df["ontology_concept"] = df["event_type"].map(ONTOLOGY_MAP)
    return df.dropna(subset=["ontology_concept"])

ONTOLOGY_MAP = {
    "impact": "iof:ImpactDamage",
    "vibration": "iof:VibrationAnomaly",
    "thermal": "iof:ThermalDegradation",
    "wear": "iof:WearPattern",
}

@asset(
    description="Failure mode dimension table",
    group_name="warehouse",
)
def dim_failure_modes(stg_maintenance_logs: pd.DataFrame) -> pd.DataFrame:
    """Build failure mode dimension from maintenance events."""
    return (
        stg_maintenance_logs
        .groupby("ontology_concept")
        .agg(
            total_events=("event_id", "count"),
            avg_severity=("severity_score", "mean"),
            last_occurrence=("event_timestamp", "max"),
        )
        .reset_index()
    )

@asset(
    description="Work order fact table",
    group_name="warehouse",
)
def fct_work_orders(
    stg_maintenance_logs: pd.DataFrame,
    dim_failure_modes: pd.DataFrame,
) -> pd.DataFrame:
    """Generate work orders from failure predictions."""
    threshold = dim_failure_modes[
        dim_failure_modes["avg_severity"] > 0.7
    ]["ontology_concept"].tolist()
    return stg_maintenance_logs[
        stg_maintenance_logs["ontology_concept"].isin(threshold)
    ].assign(work_order_status="PENDING")

@schedule(
    cron_schedule="0 6 * * *",
    job_name="cortex_pipeline",
)
def daily_cortex_schedule():
    return {}

@job
def cortex_pipeline():
    logs = stg_maintenance_logs(stg_engine_telemetry())
    modes = dim_failure_modes(logs)
    fct_work_orders(logs, modes)

@repository
def cortex_repository():
    return [cortex_pipeline, daily_cortex_schedule]
`.trim();

export function CompilationOverlay({ onComplete }: CompilationOverlayProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [done, setDone] = useState(false);
  const setPhase = useInterviewStore((s) => s.setPhase);

  const lines = MOCK_CODE.split("\n");

  useEffect(() => {
    if (done) return;

    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= lines.length) {
          clearInterval(interval);
          setTimeout(() => {
            setDone(true);
            setPhase("complete");
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [done, lines.length, setPhase]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dark/95 backdrop-blur-xl"
      >
        <div className="w-full max-w-3xl mx-8">
          {!done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-5 h-5 text-neon-blue animate-pulse-neon" />
                <span className="font-mono text-sm text-neon-blue tracking-widest uppercase">
                  Compiling Workflow...
                </span>
                <span className="ml-auto font-mono text-xs text-slate-600">
                  {visibleLines}/{lines.length} lines
                </span>
              </div>

              {/* Code window */}
              <div className="glass-panel p-4 max-h-[70vh] overflow-hidden neon-glow-blue">
                <pre className="font-mono text-xs leading-5 text-slate-400">
                  {lines.slice(0, visibleLines).map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex"
                    >
                      <span className="w-8 text-right mr-4 text-slate-700 select-none">
                        {i + 1}
                      </span>
                      <span
                        className={
                          line.startsWith("@")
                            ? "text-neon-purple"
                            : line.startsWith("def ")
                              ? "text-neon-blue"
                              : line.startsWith("class ") ||
                                  line.startsWith("from ") ||
                                  line.startsWith("import ")
                                ? "text-neon-cyan"
                                : line.includes('"""')
                                  ? "text-neon-green/60"
                                  : ""
                        }
                      >
                        {line || "\u00A0"}
                      </span>
                    </motion.div>
                  ))}
                </pre>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full"
                  style={{
                    width: `${(visibleLines / lines.length) * 100}%`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="flex flex-col items-center text-center"
            >
              <div className="relative mb-6">
                <CheckCircle2 className="w-20 h-20 text-neon-green" />
                <div className="absolute inset-0 w-20 h-20 bg-neon-green/20 rounded-full blur-2xl animate-pulse-neon" />
              </div>

              <h2 className="font-mono text-2xl font-bold text-neon-green tracking-wider mb-2 neon-text-blue">
                SYSTEM ONLINE
              </h2>
              <p className="text-slate-500 font-mono text-sm mb-8">
                Pipeline compiled successfully · {lines.length} lines generated
              </p>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onComplete}
                className="px-6 py-2.5 rounded-xl bg-neon-green/10 border border-neon-green/30 font-mono text-sm text-neon-green hover:bg-neon-green/20 transition-colors"
              >
                RETURN TO CORTEX
              </motion.button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
