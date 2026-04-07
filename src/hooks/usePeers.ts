import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface PeerInfo {
  instance_name: string;
  nickname: string;
  pet: string;
  ip: string;
  port: number;
}

export function usePeers() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  useEffect(() => {
    const unlisten = listen<PeerInfo[]>("peers-changed", (e) => {
      setPeers(e.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return peers;
}
