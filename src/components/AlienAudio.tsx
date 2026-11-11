import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play } from "lucide-react";

const celebrationKey = "knightfall:alien-celebrations";
const celebratedGames = new Set<string>(
  (() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(celebrationKey) || "[]",
      );
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string").slice(-200)
        : [];
    } catch {
      return [];
    }
  })(),
);

/** One short celebration per game. The supplied clip is local, so it works offline. */
export function AlienAudio({
  gameId,
  active,
  enabled,
}: {
  gameId: string;
  active: boolean;
  enabled: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<
    "idle" | "playing" | "paused" | "blocked" | "error"
  >("idle");
  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    let cancelled = false;
    if (!active || !enabled) {
      player.pause();
      setState("idle");
      return;
    }
    player.volume = 0.35;
    if (!celebratedGames.has(gameId)) {
      if (celebratedGames.size >= 200)
        celebratedGames.delete(celebratedGames.values().next().value!);
      celebratedGames.add(gameId);
      try {
        localStorage.setItem(
          celebrationKey,
          JSON.stringify([...celebratedGames]),
        );
      } catch {
        /* Session memory still prevents replay. */
      }
      player.currentTime = 0;
      void player.play().catch(() => {
        if (!cancelled) setState("blocked");
      });
    } else {
      setState("paused");
    }
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [gameId, active, enabled]);
  return (
    <>
      <audio
        ref={audio}
        src="./audio/alien-gambit.mp3"
        preload="none"
        onPlay={() => setState("playing")}
        onPause={() => setState((s) => (s === "playing" ? "paused" : s))}
        onEnded={() => setState("idle")}
        onError={() => setState("error")}
      />
      {active && enabled && state !== "idle" && (
        <div className="alien-audio" role="status">
          <Music2 size={16} />
          <span>
            {state === "error"
              ? "Alien sound unavailable"
              : "Alien Gambit unlocked"}
          </span>
          {state !== "error" && (
            <button
              className="button secondary small"
              onClick={() => {
                const player = audio.current;
                if (!player) return;
                if (state === "playing") player.pause();
                else void player.play().catch(() => setState("blocked"));
              }}
            >
              {state === "playing" ? <Pause size={14} /> : <Play size={14} />}{" "}
              {state === "playing" ? "Pause sound" : "Play sound"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
