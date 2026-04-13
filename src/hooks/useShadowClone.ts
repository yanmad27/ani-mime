import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

const STORE_FILE = "settings.json";
const STORE_KEY = "shadowCloneEnabled";
const EVENT_NAME = "shadow-clone-enabled-changed";

export function useShadowClone() {
  const [enabled, setEnabledState] = useState(true);

  useLayoutEffect(() => {
    load(STORE_FILE).then(async (store) => {
      const val = await store.get<boolean>(STORE_KEY);
      if (val !== null && val !== undefined) {
        setEnabledState(val);
      }
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>(EVENT_NAME, (event) => {
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
    await emit(EVENT_NAME, next);
  };

  return { enabled, setEnabled };
}
