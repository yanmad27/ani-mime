import { invoke } from "@tauri-apps/api/core";

export interface SessionInfo {
  pid: number;
  title: string;
  ui_state: string;
}

export async function fetchSessions(): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>("get_sessions");
}
