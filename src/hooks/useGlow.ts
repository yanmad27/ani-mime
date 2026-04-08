import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

const STORE_FILE = "settings.json";
const STORE_KEY = "glowEnabled";

export function useGlow() {
  const [enabled, setEnabledState] = useState(true);

  useLayoutEffect(() => {
    load(STORE_FILE).then((store) => {
      store.get<boolean>(STORE_KEY).then((saved) => {
        setEnabledState(saved ?? true);
      });
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("glow-changed", (event) => {
      setEnabledState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setEnabled = async (next: boolean) => {
    setEnabledState(next);
    const store = await load(STORE_FILE);
    await store.set(STORE_KEY, next);
    await store.save();
    await emit("glow-changed", next);
  };

  return { enabled, setEnabled };
}
