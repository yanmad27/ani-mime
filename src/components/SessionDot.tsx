import { fetchSessions } from "../hooks/useSessions";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import "../styles/session-dot.css";

const stateLabel: Record<string, string> = {
  busy: "working",
  service: "service",
  idle: "idle",
};

export function SessionDot() {
  const showSessions = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const sessions = await fetchSessions();
    const items: MenuItem[] = [];

    if (sessions.length === 0) {
      items.push(
        await MenuItem.new({ id: "none", text: "No active sessions", enabled: false })
      );
    } else {
      for (const s of sessions) {
        const label = stateLabel[s.ui_state] ?? s.ui_state;
        items.push(
          await MenuItem.new({
            id: `s-${s.pid}`,
            text: `${s.title}  —  ${label}`,
            enabled: false,
          })
        );
      }
    }

    const menu = await Menu.new({ items });
    await menu.popup();
  };

  return (
    <span
      className="session-dot-btn"
      onContextMenu={showSessions}
      onClick={showSessions}
      role="button"
      title="Active sessions"
    >
      <span className="session-dot-icon" />
    </span>
  );
}
