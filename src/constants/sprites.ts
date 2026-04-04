import type { Status, SpriteConfig, Pet, PetInfo } from "../types/status";

export const pets: PetInfo[] = [
  {
    id: "rottweiler",
    name: "Rottweiler",
    preview: "Sittiing.png",
    sprites: {
      disconnected: { file: "SleepDogg.png", frames: 8 },
      busy: { file: "RottweilerSniff.png", frames: 31 },
      service: { file: "RottweilerBark.png", frames: 12 },
      idle: { file: "Sittiing.png", frames: 8 },
      searching: { file: "RottweilerIdle.png", frames: 6 },
      initializing: { file: "RottweilerIdle.png", frames: 6 },
    },
  },
  {
    id: "dalmatian",
    name: "Dalmatian",
    preview: "DalmatianSitting.png",
    sprites: {
      disconnected: { file: "DalmatianSleep.png", frames: 8 },
      busy: { file: "DalmatianSniff.png", frames: 26 },
      service: { file: "DalmatianBark.png", frames: 12 },
      idle: { file: "DalmatianSitting.png", frames: 8 },
      searching: { file: "DalmatianIdle.png", frames: 7 },
      initializing: { file: "DalmatianIdle.png", frames: 7 },
    },
  },
];

export function getSpriteMap(petId: Pet): Record<Status, SpriteConfig> {
  const pet = pets.find((p) => p.id === petId);
  return pet ? pet.sprites : pets[0].sprites;
}

export const autoStopStatuses = new Set<Status>(["idle", "disconnected"]);
