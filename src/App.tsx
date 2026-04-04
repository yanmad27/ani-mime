import { Mascot } from "./components/Mascot";
import { StatusPill } from "./components/StatusPill";
import { useStatus } from "./hooks/useStatus";
import { useDrag } from "./hooks/useDrag";
import { useTheme } from "./hooks/useTheme";
import "./styles/theme.css";
import "./styles/app.css";

function App() {
  const status = useStatus();
  const { dragging, onMouseDown } = useDrag();
  useTheme();

  return (
    <div
      className={`container ${dragging ? "dragging" : ""}`}
      onMouseDown={onMouseDown}
    >
      <Mascot status={status} />
      <StatusPill status={status} />
    </div>
  );
}

export default App;
