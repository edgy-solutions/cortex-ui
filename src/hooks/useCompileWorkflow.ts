import { useMutation } from "@tanstack/react-query";
import { compileWorkflow } from "@/api/client";
import type {
  CompileRequest,
  CompileResponse,
  BPMNPayload,
  BPMNTask,
  BPMNGateway,
  BPMNSequenceFlow,
} from "@/api/types";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useMockWorkflowBuilder } from "./useMockWorkflowBuilder";

/**
 * Hook for compiling the workflow blueprint into a Dagster job.
 *
 * Maps React Flow nodes/edges into a BPMNPayload:
 *   - `trigger` / `action` nodes → BPMNTask (service_task / user_task)
 *   - `logic` nodes (diamond/routing) → BPMNGateway (exclusive)
 *   - edges → BPMNSequenceFlow
 *
 * On success, transitions to the "complete" phase and exposes `bootLog`.
 */
export function useCompileWorkflow() {
  const setPhase = useInterviewStore((s) => s.setPhase);

  // Get the current blueprint nodes/edges from the workflow builder
  const { nodes, edges } = useMockWorkflowBuilder();

  const mutation = useMutation<CompileResponse, Error, void>({
    mutationFn: async () => {
      // ── Classify nodes into BPMN tasks vs gateways ──
      const tasks: BPMNTask[] = [];
      const gateways: BPMNGateway[] = [];

      for (const n of nodes) {
        const label = (n.data as { label?: string }).label ?? n.id;

        if (n.type === "logic") {
          // Diamond / routing nodes → BPMN gateways
          gateways.push({
            id: n.id,
            name: label,
            type: "exclusive",
          });
        } else {
          // trigger + action nodes → BPMN tasks
          const taskType =
            n.type === "action" ? "user_task" : "service_task";
          tasks.push({
            id: n.id,
            name: label,
            type: taskType,
            agent_endpoint: `http://restate-agent-svc:8081/${n.id}`,
          });
        }
      }

      // ── Map edges → BPMN sequence flows ──
      const sequence_flows: BPMNSequenceFlow[] = edges.map((e, i) => ({
        id: `flow_${i}`,
        source_ref: e.source,
        target_ref: e.target,
      }));

      const bpmn_payload: BPMNPayload = {
        tasks,
        gateways,
        sequence_flows,
      };

      const request: CompileRequest = {
        session_id: `session-${Date.now()}`,
        bpmn_payload,
      };

      return compileWorkflow(request);
    },
    onSuccess: (data) => {
      if (data.success) {
        setPhase("complete");
      }
    },
    onError: (error) => {
      console.error("Workflow compilation failed:", error);
    },
  });

  return {
    compile: mutation.mutate,
    compileAsync: mutation.mutateAsync,
    isCompiling: mutation.isPending,
    error: mutation.error,
    runId: mutation.data?.run_id,
    dagsterJobName: mutation.data?.dagster_job_name,
    bootLog: mutation.data?.boot_log,
  };
}
