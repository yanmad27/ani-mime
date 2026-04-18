import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

export function useAutoInstall() {
  const [enabled, setEnabledState] = useState(true);

  useLayoutEffect(() => {
    load("settings.json").then(async (store) => {
      const val = await store.get<boolean>("autoInstallEnabled");
      if (val !== null && val !== undefined) {
        setEnabledState(val);
      }
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("auto-install-changed", (event) => {
      setEnabledState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setEnabled = async (next: boolean) => {
    const store = await load("settings.json");
    await store.set("autoInstallEnabled", next);
    await store.save();
    setEnabledState(next);
    await emit("auto-install-changed", next);
  };

  return { enabled, setEnabled };
}
