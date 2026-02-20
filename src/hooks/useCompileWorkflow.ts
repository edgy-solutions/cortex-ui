import { useMutation } from "@tanstack/react-query";
import { compileWorkflow } from "@/api/client";
import type { CompileRequest, CompileResponse } from "@/api/types";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useMockWorkflowBuilder } from "./useMockWorkflowBuilder";

/**
 * Hook for compiling the workflow blueprint into a Dagster job.
 *
 * Collects the current interview state (ontology terms, data bindings,
 * and the generated React Flow nodes/edges) and sends it to the backend.
 *
 * On success, transitions to the "complete" phase and returns the run_id.
 */
export function useCompileWorkflow() {
  const ontologyTerms = useInterviewStore((s) => s.ontologyTerms);
  const dataBindings = useInterviewStore((s) => s.dataBindings);
  const setPhase = useInterviewStore((s) => s.setPhase);

  // Get the current blueprint nodes/edges
  const { nodes, edges } = useMockWorkflowBuilder();

  const mutation = useMutation<CompileResponse, Error, void>({
    mutationFn: async () => {
      // Build the compile request from current state
      const request: CompileRequest = {
        session_id: `session-${Date.now()}`,
        blueprint: {
          ontology_terms: ontologyTerms.map((t) => ({
            category: t.category,
            label: t.label,
          })),
          data_bindings: dataBindings.map((b) => ({
            model: b.model,
            schema: b.schema,
            healthy: b.healthy,
          })),
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type ?? "unknown",
            label: (n.data as { label?: string }).label ?? n.id,
          })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
          })),
        },
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
  };
}
