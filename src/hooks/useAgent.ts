import { useQuery } from "@tanstack/react-query";
import { healthCheck } from "@/api/client";
import { useInterviewAgent } from "./useInterviewAgent";
import { useMockAgent } from "./useMockAgent";

/**
 * Unified agent hook that automatically switches between the real API
 * and the mock implementation based on backend availability.
 *
 * Use this in components instead of useMockAgent or useInterviewAgent directly.
 *
 * Behavior:
 * - On mount, performs a health check against the backend
 * - If backend is available, uses useInterviewAgent (real streaming)
 * - If backend is unavailable, falls back to useMockAgent (local simulation)
 * - Exposes a consistent interface regardless of which implementation is active
 */
export function useAgent() {
  // Check if backend is available (cached for 30 seconds)
  const { data: backendAvailable = false, isLoading: isCheckingBackend } =
    useQuery({
      queryKey: ["backend-health"],
      queryFn: healthCheck,
      staleTime: 30_000,
      gcTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    });

  // Get both hook implementations
  const realAgent = useInterviewAgent();
  const mockAgent = useMockAgent();

  // Select the active implementation
  const agent = backendAvailable ? realAgent : mockAgent;

  return {
    sendMessage: agent.sendMessage,
    isProcessing: isCheckingBackend || agent.isProcessing,
    isConnected: backendAvailable,
    isCheckingConnection: isCheckingBackend,
    // Only available on real agent
    cancelStream: backendAvailable ? realAgent.cancelStream : undefined,
    error: backendAvailable ? realAgent.error : undefined,
  };
}
