import { Layout } from "@/components/Layout";
import { NeuralStream } from "@/components/NeuralStream/NeuralStream";
import { HUD } from "@/components/HUD/HUD";
import { WorkflowCanvas } from "@/components/Blueprint/WorkflowCanvas";
import { useInterviewStore } from "@/store/useInterviewStore";

export default function App() {
  const phase = useInterviewStore((s) => s.phase);
  const showBlueprint = phase === "blueprint" || phase === "compiling" || phase === "complete";

  return (
    <Layout
      stream={showBlueprint ? <WorkflowCanvas /> : <NeuralStream />}
      hud={<HUD />}
    />
  );
}
