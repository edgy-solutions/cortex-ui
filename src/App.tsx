import { Layout } from "@/components/Layout";
import { NeuralStream } from "@/components/NeuralStream/NeuralStream";
import { HUD } from "@/components/HUD/HUD";
import { CanvasPane } from "@/components/AgenticCanvas/CanvasPane";

export default function App() {
  return (
    <Layout
      stream={<NeuralStream />}
      canvas={<CanvasPane />}
      hud={<HUD />}
    />
  );
}
