import { Mascot } from "./components/Mascot";
import { StatusPill } from "./components/StatusPill";
import { SpeechBubble } from "./components/SpeechBubble";
import { VisitorDog } from "./components/VisitorDog";
import { useStatus } from "./hooks/useStatus";
import { useDrag } from "./hooks/useDrag";
import { useTheme } from "./hooks/useTheme";
import { useBubble } from "./hooks/useBubble";
import { useVisitors } from "./hooks/useVisitors";
import "./styles/theme.css";
import "./styles/app.css";

function App() {
  const status = useStatus();
  const { dragging, onMouseDown } = useDrag();
  const { visible, message, dismiss } = useBubble();
  const visitors = useVisitors();
  useTheme();

  return (
    <div
      className={`container ${dragging ? "dragging" : ""}`}
      onMouseDown={onMouseDown}
    >
      <SpeechBubble visible={visible} message={message} onDismiss={dismiss} />
      {status !== "visiting" && <Mascot status={status} />}
      {status === "visiting" && <div style={{ width: 128, height: 128 }} />}
      <StatusPill status={status} glow={visible} />
      {visitors.map((v, i) => (
        <VisitorDog key={v.nickname} pet={v.pet} nickname={v.nickname} index={i} />
      ))}
    </div>
  );
}

export default App;
