import { Mascot } from "./components/Mascot";
import { StatusPill } from "./components/StatusPill";
import { SpeechBubble } from "./components/SpeechBubble";
import { VisitorDog } from "./components/VisitorDog";
import { DevTag } from "./components/DevTag";
import { useStatus } from "./hooks/useStatus";
import { useDrag } from "./hooks/useDrag";
import { useTheme } from "./hooks/useTheme";
import { useBubble } from "./hooks/useBubble";
import { useVisitors } from "./hooks/useVisitors";
import { usePeers } from "./hooks/usePeers";
import { useNickname } from "./hooks/useNickname";
import { usePet } from "./hooks/usePet";
import { useScale } from "./hooks/useScale";
import { useDevMode } from "./hooks/useDevMode";
import { useWindowAutoSize } from "./hooks/useWindowAutoSize";
import { useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import "./styles/theme.css";
import "./styles/app.css";

function App() {
  const { status, scenario } = useStatus();
  const { dragging, onMouseDown } = useDrag();
  const { visible, message, dismiss } = useBubble();
  const visitors = useVisitors();
  const peers = usePeers();
  const { nickname } = useNickname();
  const { pet } = usePet();
  const { scale } = useScale();
  const devMode = useDevMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [cloneActive, setCloneActive] = useState(false);
  const savedWindowRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useTheme();
  useWindowAutoSize(containerRef, cloneActive);

  const handleCloneEffectChange = useCallback(async (active: boolean) => {
    try {
      const win = getCurrentWindow();

      if (active) {
        setCloneActive(true);

        const factor = await win.scaleFactor();
        const physPos = await win.outerPosition();
        const physSize = await win.outerSize();

        const logX = physPos.x / factor;
        const logY = physPos.y / factor;
        const logW = physSize.width / factor;
        const logH = physSize.height / factor;

        savedWindowRef.current = { x: logX, y: logY, w: logW, h: logH };

        const expandedSize = 1200;
        const shiftX = (expandedSize - logW) / 2;
        const shiftY = (expandedSize - logH) / 2;

        await win.setShadow(false);
        await win.setPosition(new LogicalPosition(logX - shiftX, logY - shiftY));
        await win.setSize(new LogicalSize(expandedSize, expandedSize));
      } else {
        if (savedWindowRef.current) {
          const { x, y, w, h } = savedWindowRef.current;
          await win.setPosition(new LogicalPosition(x, y));
          await win.setSize(new LogicalSize(w, h));
          await win.setShadow(true);
          savedWindowRef.current = null;
        }
        setCloneActive(false);
      }
    } catch (err) {
      console.error("[clone] error:", err);
    }
  }, []);

  const onContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (status === "visiting") return;

    const items: MenuItem[] = [];

    if (peers.length === 0) {
      const item = await MenuItem.new({
        id: "no-peers",
        text: "No peers nearby \u2014 check Local Network permission",
        enabled: false,
      });
      items.push(item);
    } else {
      for (const peer of peers) {
        const peerId = peer.instance_name;
        const item = await MenuItem.new({
          id: peerId,
          text: `Visit ${peer.nickname} (${peer.pet})`,
          action: async () => {
            try {
              await invoke("start_visit", {
                peerId,
                nickname,
                pet,
              });
            } catch (err) {
              console.error("Visit failed:", err);
            }
          },
        });
        items.push(item);
      }
    }

    const menu = await Menu.new({ items });
    await menu.popup();
  };

  return (
    <div
      ref={containerRef}
      data-testid="app-container"
      className={`container ${dragging ? "dragging" : ""} ${scenario ? "scenario-active" : ""} ${devMode ? "dev-border" : ""}`}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {scenario && <div data-testid="scenario-badge" className="scenario-badge">SCENARIO</div>}
      <SpeechBubble visible={visible} message={message} onDismiss={dismiss} />
      {status !== "visiting" && <Mascot status={status} onCloneEffectChange={handleCloneEffectChange} />}
      {status === "visiting" && <div style={{ width: 128 * scale, height: 128 * scale }} />}
      <StatusPill status={status} glow={visible} />
      {devMode && <DevTag />}
      {visitors.map((v, i) => (
        <VisitorDog key={v.instance_name || v.nickname} pet={v.pet} nickname={v.nickname} index={i} />
      ))}
    </div>
  );
}

export default App;
