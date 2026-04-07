import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface Visitor {
  pet: string;
  nickname: string;
  duration_secs: number;
}

export function useVisitors() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);

  useEffect(() => {
    const unlistenArrived = listen<Visitor>("visitor-arrived", (e) => {
      setVisitors((prev) => [...prev, e.payload]);
    });

    const unlistenLeft = listen<{ nickname: string }>("visitor-left", (e) => {
      setVisitors((prev) => prev.filter((v) => v.nickname !== e.payload.nickname));
    });

    return () => {
      unlistenArrived.then((fn) => fn());
      unlistenLeft.then((fn) => fn());
    };
  }, []);

  return visitors;
}
