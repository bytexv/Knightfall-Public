import { Chess, type Color } from "chess.js";
import type { Gambit } from "./gambits";
import { guidedOpening, explainLearningMove } from "./guided-game";
export interface GuidedPly {
  san: string;
  color: Color;
  title: string;
  goal: string;
  why: string;
}
export interface GuidedLesson {
  id: string;
  title: string;
  idea: string;
  risk: string;
  completion: string;
  plies: GuidedPly[];
}
const pieceNames = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const alienNotes = [
  "White takes central space and opens a diagonal for the bishop.",
  "Black prepares d5 with the Caro–Kann pawn structure.",
  "White builds a two-pawn center and supports e4.",
  "Black challenges the center immediately.",
  "White develops the knight and defends e4.",
  "Black captures on e4. White’s knight can recapture.",
  "White recovers the pawn and brings the knight into the center.",
  "Black develops a knight and attacks White’s knight on e4.",
  "White moves toward f7. The knight now attacks that pawn near Black’s king.",
  "Black attacks the knight with h6. The Alien Gambit answers with a sacrifice instead of retreating.",
  "Nxf7 is the signature sacrifice. White gives up a knight to draw the king out; this is risky and does not force a win.",
  "The teaching bot accepts the sacrifice with Kxf7, exposing its king. A real opponent can choose a different defense.",
  "White develops another piece toward the center. Look for checks and attacking moves, but remember that White is down material.",
];
export function openingLesson(gambit: Gambit): GuidedLesson {
  const chess = new Chess();
  return {
    id: gambit.id,
    title: gambit.name,
    idea: gambit.idea,
    risk: gambit.risk,
    completion: `You completed the ${gambit.name} teaching line. Try the resulting position against a local bot, or repeat the lesson.`,
    plies: gambit.moves.map((san, index) => {
      const move = chess.move(san),
        piece = pieceNames[move.piece];
      return {
        san: move.san,
        color: move.color,
        title: `${Math.floor(index / 2) + 1}${move.color === "w" ? "." : "…"} ${move.san}`,
        goal: `Play ${move.san}: move your ${piece} from ${move.from} to ${move.to}${move.promotion ? ` and promote to a ${pieceNames[move.promotion]}` : ""}.`,
        why:
          gambit.id === "alien"
            ? alienNotes[index] || gambit.idea
            : explainLearningMove(move, move.color === "w" ? "White" : "Black")
                .replace("You played", "This line uses")
                .replace(" and moved", ", moving")
                .replace(" and captured", ", capturing")
                .replace(" and promoted", ", promoting"),
      };
    }),
  };
}
const italianBoard = new Chess();
export const italianLesson: GuidedLesson = {
  id: "italian-basics",
  title: "Guided game",
  idea: "Claim the center, develop pieces, and castle.",
  risk: "This is one solid plan; other legal openings are possible.",
  completion:
    "You claimed the center, developed your pieces, and castled. Keep playing from this position with a real local bot, or repeat the lesson.",
  plies: guidedOpening.flatMap((step) =>
    [step.move, step.reply].map((san, index) => {
      const move = italianBoard.move(san);
      return {
        san: move.san,
        color: move.color,
        title: step.title,
        goal: index === 0 ? step.goal : `Watch ${move.san}.`,
        why: index === 0 ? step.why : step.response,
      };
    }),
  ),
};
/** Rewind through the most recent player move and any reply, keeping an opening bot move. */
export function previousPlayerTurn(
  moves: readonly string[],
  color: Color,
): string[] {
  for (let i = moves.length - 1; i >= 0; i--)
    if (i % 2 === (color === "w" ? 0 : 1)) return moves.slice(0, i);
  return [...moves];
}
