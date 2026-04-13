import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

export function useTrayVisible() {
  const [hidden, setHiddenState] = useState(false);

  useLayoutEffect(() => {
    load("settings.json").then(async (store) => {
      const val = await store.get<boolean>("hideTray");
      if (val !== null && val !== undefined) {
        setHiddenState(val);
      }
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("hide-tray-changed", (event) => {
      setHiddenState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setHidden = async (next: boolean) => {
    const store = await load("settings.json");
    await store.set("hideTray", next);
    await store.save();
    await invoke("set_tray_visible", { visible: !next });
    setHiddenState(next);
    await emit("hide-tray-changed", next);
  };

  return { hidden, setHidden };
}
