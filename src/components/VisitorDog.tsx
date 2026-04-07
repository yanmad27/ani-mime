import { useState, useEffect } from "react";
import { getSpriteMap } from "../constants/sprites";
import type { Pet } from "../types/status";
import "../styles/visitor.css";

interface VisitorDogProps {
  pet: string;
  nickname: string;
  index: number;
}

export function VisitorDog({ pet, nickname, index }: VisitorDogProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const spriteMap = getSpriteMap(pet as Pet);
  const sprite = spriteMap.idle;
  const spriteUrl = new URL(
    `../assets/sprites/${sprite.file}`,
    import.meta.url
  ).href;

  const offset = index * 80;

  return (
    <div
      className={`visitor-dog ${entered ? "entered" : ""}`}
      style={{ "--visitor-offset": `${offset}px` } as React.CSSProperties}
    >
      <div className="visitor-name">{nickname}</div>
      <div
        className="visitor-sprite"
        style={{
          backgroundImage: `url(${spriteUrl})`,
          width: 96,
          height: 96,
          "--sprite-steps": sprite.frames,
          "--sprite-width": `${sprite.frames * 96}px`,
          "--sprite-duration": `${sprite.frames * 80}ms`,
        } as React.CSSProperties}
      />
    </div>
  );
}
