import { useState, useLayoutEffect, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { emit, listen } from "@tauri-apps/api/event";
import type { Pet } from "../types/status";

const STORE_FILE = "settings.json";
const STORE_KEY = "pet";

export function usePet() {
  const [pet, setPetState] = useState<Pet>("rottweiler");
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    load(STORE_FILE).then((store) => {
      store.get<Pet>(STORE_KEY).then((saved) => {
        const p = saved ?? "rottweiler";
        setPetState(p);
        setLoaded(true);
      });
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<Pet>("pet-changed", (event) => {
      setPetState(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setPet = async (next: Pet) => {
    setPetState(next);
    const store = await load(STORE_FILE);
    await store.set(STORE_KEY, next);
    await store.save();
    await emit("pet-changed", next);
  };

  return { pet, setPet, loaded };
}
