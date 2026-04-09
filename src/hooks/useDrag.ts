import { useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useDrag() {
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".session-dot-btn")) return;
    setDragging(true);
    await getCurrentWindow().startDragging();
    setDragging(false);
  }, []);

  return { dragging, onMouseDown };
}
