import { useState, useEffect, useLayoutEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";

export type Theme = "dark" | "light";

const STORE_FILE = "settings.json";
const STORE_KEY = "theme";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    load(STORE_FILE).then((store) => {
      store.get<Theme>(STORE_KEY).then((saved) => {
        const t = saved ?? "dark";
        setThemeState(t);
        applyTheme(t);
        setLoaded(true);
      });
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<Theme>("theme-changed", (event) => {
      setThemeState(event.payload);
      applyTheme(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setTheme = async (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    const store = await load(STORE_FILE);
    await store.set(STORE_KEY, next);
    await store.save();
    await emit("theme-changed", next);
  };

  return { theme, setTheme, loaded };
}
