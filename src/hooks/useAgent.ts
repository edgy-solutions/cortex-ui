import { useQuery } from "@tanstack/react-query";
import { healthCheck } from "@/api/client";
import { useInterviewAgent } from "./useInterviewAgent";

/**
 * Unified agent hook — hardwired to the real Mesh backend.
 *
 * The health check remains for observability but does NOT gate agent selection.
 * The real interview agent is always used, ensuring the UI consumes live
 * Dagster orchestration output instead of falling back to mock data.
 */
export function useAgent() {
  const { data: backendAvailable = false, isLoading: isCheckingBackend } =
    useQuery({
      queryKey: ["backend-health"],
      queryFn: healthCheck,
      staleTime: 30_000,
      gcTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  const realAgent = useInterviewAgent();

  // FORCE THE REAL AGENT — bypass mock fallback
  const agent = realAgent;

  return {
    sendMessage: agent.sendMessage,
    isProcessing: isCheckingBackend || agent.isProcessing,
    isConnected: true, // Force true — trust the mesh
    isCheckingConnection: isCheckingBackend,
    cancelStream: realAgent.cancelStream,
    error: realAgent.error,
  };
}
