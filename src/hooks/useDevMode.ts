import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";

const STORE_FILE = "settings.json";
const STORE_KEY = "devMode";

export function useDevMode() {
  const [devMode, setDevMode] = useState(false);

  useLayoutEffect(() => {
    load(STORE_FILE).then((store) => {
      store.get<boolean>(STORE_KEY).then((saved) => {
        setDevMode(saved ?? false);
      });
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("dev-mode-changed", (event) => {
      setDevMode(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return devMode;
}
