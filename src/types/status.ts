export type Status =
  | "initializing"
  | "searching"
  | "idle"
  | "busy"
  | "service"
  | "disconnected";

export interface SpriteConfig {
  file: string;
  frames: number;
}

export type Pet = "rottweiler" | "dalmatian";

export interface PetInfo {
  id: Pet;
  name: string;
  preview: string;
  sprites: Record<Status, SpriteConfig>;
}
