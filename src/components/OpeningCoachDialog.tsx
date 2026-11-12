import { useCallback, useMemo, useState } from "react";
import type { Color } from "chess.js";
import type { Gambit } from "../data/gambits";
import { openingLesson } from "../data/opening-coach";
import { CoachBoard } from "./LearningModes";
import { Modal } from "./Dialogs";
const complete = () => {};
export default function OpeningCoachDialog({
  gambit,
  onClose,
  alienEnabled,
  alienAudioEnabled,
}: {
  gambit: Gambit;
  onClose: () => void;
  alienEnabled: boolean;
  alienAudioEnabled: boolean;
}) {
  const [side, setSide] = useState<Color>(
    gambit.tags.includes("Black") ? "b" : "w",
  );
  const [round, setRound] = useState(0);
  const [mode, setMode] = useState<"guided" | "practice">("guided");
  const lesson = useMemo(() => openingLesson(gambit), [gambit]);
  const practice = useCallback(() => setMode("practice"), []);
  return (
    <Modal
      title={`${gambit.name} · ${mode === "guided" ? "train with bot" : "coach practice"}`}
      onClose={onClose}
      size="wide"
    >
      <div className="opening-coach-intro">
        <p>{lesson.idea}</p>
        <small>{lesson.risk}</small>
        <div
          className="coach-side-options"
          role="group"
          aria-label="Your side in the lesson"
        >
          {(["w", "b"] as const).map((color) => (
            <button
              key={color}
              className="button secondary"
              aria-pressed={side === color}
              onClick={() => {
                if (side !== color) {
                  setSide(color);
                  setMode("guided");
                  setRound((r) => r + 1);
                }
              }}
            >
              Play {color === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
        <p className="fine-print">
          {mode === "guided"
            ? "You play one side. The teaching bot plays the other side of this line automatically. Changing sides starts the lesson again."
            : "Choose your own moves now. The local bot replies freely; hints and takebacks are available."}
        </p>
      </div>
      <CoachBoard
        key={`${side}:${round}`}
        initialMode={mode}
        lesson={lesson}
        playerColor={side}
        alienEnabled={alienEnabled}
        alienAudioEnabled={alienAudioEnabled}
        onComplete={complete}
        onPractice={practice}
        onRestart={() => setRound((r) => r + 1)}
      />
    </Modal>
  );
}
