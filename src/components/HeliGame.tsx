"use client";

import { useEffect, useRef } from "react";
import { createGame, type Dir, type GameHandle } from "@/game/engine";

const BUTTONS: { dir: Dir; label: string; glyph: string }[] = [
  { dir: "left", label: "Tilt left", glyph: "←" },
  { dir: "right", label: "Tilt right", glyph: "→" },
  { dir: "down", label: "Sink", glyph: "↓" },
  { dir: "up", label: "Lift", glyph: "↑" },
];

export default function HeliGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createGame(canvas);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const bind = (dir: Dir) => {
    const down = (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      gameRef.current?.press(dir, true);
      e.currentTarget.classList.add("on");
    };
    const up = (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      gameRef.current?.press(dir, false);
      e.currentTarget.classList.remove("on");
    };
    return {
      onPointerDown: down,
      onPointerUp: up,
      onPointerCancel: up,
      onPointerLeave: up,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  };

  const group = (dirs: Dir[]) => (
    <div className="grp">
      {BUTTONS.filter((b) => dirs.includes(b.dir)).map((b) => (
        <button key={b.dir} type="button" aria-label={b.label} {...bind(b.dir)}>
          {b.glyph}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="stage">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          tabIndex={0}
          role="img"
          aria-label="Helicopter game. Fly from the start helipad to the target helipad with the arrow keys."
        />
      </div>
      <div className="touch" aria-label="Touch controls">
        {group(["left", "right"])}
        {group(["down", "up"])}
      </div>
    </>
  );
}
