import { Chess } from "chess.js";
export interface BeginnerExercise {
  id: string;
  title: string;
  rule: string;
  task: string;
  fen: string;
  hint: { from: string; to: string };
  success: string;
  goal: "move" | "safe-king" | "mate" | "promotion";
}
export const beginnerExercises: BeginnerExercise[] = [
  {
    id: "pawn",
    title: "1. Your first pawn move",
    rule: "White moves first, then players take turns. Pawns move forward one square, or two from their starting square if both squares are empty. They capture one square diagonally.",
    task: "Move the pawn from e2 to e4. Click the pawn, then its destination, or drag it.",
    fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
    hint: { from: "e2", to: "e4" },
    success:
      "You moved two squares from the starting rank. The letters name files; the numbers name ranks. That square is e4.",
    goal: "move",
  },
  {
    id: "rook",
    title: "2. Rooks travel straight",
    rule: "A rook moves any distance along a row or column. It cannot jump over pieces. Capture an enemy piece by landing on its square.",
    task: "Use the rook on a1 to capture the pawn on a7.",
    fen: "7k/p7/8/8/8/8/8/R6K w - - 0 1",
    hint: { from: "a1", to: "a7" },
    success:
      "Rxa7 means “rook captures on a7”. The x tells you it is a capture. Rooks are especially useful on open files.",
    goal: "move",
  },
  {
    id: "bishop",
    title: "3. Bishops travel diagonally",
    rule: "A bishop moves any distance diagonally, staying on the same square color for the whole game. Other pieces block its path.",
    task: "Capture the pawn on g5 with your bishop on c1.",
    fen: "4k3/8/8/6p1/8/8/8/2B1K3 w - - 0 1",
    hint: { from: "c1", to: "g5" },
    success:
      "Your bishop followed c1–d2–e3–f4–g5. Long, open diagonals make bishops powerful.",
    goal: "move",
  },
  {
    id: "knight",
    title: "4. Knights can jump",
    rule: "A knight moves in an L: two squares one way and one sideways. It is the only piece that can jump over other pieces.",
    task: "Jump your knight from b1 to c3, over the pawns.",
    fen: "4k3/8/8/8/8/8/P1P5/1N2K3 w - - 0 1",
    hint: { from: "b1", to: "c3" },
    success:
      "Nc3 develops your knight toward the center. A knight always lands on the opposite square color.",
    goal: "move",
  },
  {
    id: "queen",
    title: "5. Meet the queen",
    rule: "The queen combines the rook and bishop: she moves straight or diagonally, any distance, without jumping.",
    task: "Capture the pawn on h5 with the queen on d1.",
    fen: "k7/8/8/7p/8/8/8/3QK3 w - - 0 1",
    hint: { from: "d1", to: "h5" },
    success:
      "Qxh5 uses a diagonal. The queen is valuable, so check whether an enemy piece could capture her before moving.",
    goal: "move",
  },
  {
    id: "king",
    title: "6. Keep your king safe",
    rule: "The king moves one square in any direction. It may never move onto an attacked square. You cannot capture the other king.",
    task: "Move your king from e1 to d2.",
    fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    hint: { from: "e1", to: "d2" },
    success:
      "The king can move diagonally too. Later in the game, bring it closer to help your pawns—while avoiding check.",
    goal: "move",
  },
  {
    id: "check",
    title: "7. Answer a check",
    rule: "Check means your king is under attack. You must escape: move the king, capture the attacker, or block the attack. Illegal moves are not allowed.",
    task: "The rook attacks your king along the e-file. Move your king to any safe square.",
    fen: "k3r3/8/8/8/8/8/8/4K3 w - - 0 1",
    hint: { from: "e1", to: "d1" },
    success:
      "Your king is safe. Before every move, check what your opponent threatens.",
    goal: "safe-king",
  },
  {
    id: "castle",
    title: "8. Castle for safety",
    rule: "Castling moves the king two squares toward a rook, then the rook jumps beside it. Neither may have moved. The path must be empty; the king cannot castle out of, through, or into check.",
    task: "Castle kingside: move your king from e1 to g1.",
    fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
    hint: { from: "e1", to: "g1" },
    success:
      "O-O is kingside castling. Your king moved to g1 and rook to f1 in one turn.",
    goal: "move",
  },
  {
    id: "promotion",
    title: "9. Promote a pawn",
    rule: "A pawn that reaches the last rank becomes a queen, rook, bishop, or knight. A queen is usually strongest; sometimes another piece avoids stalemate.",
    task: "Move the pawn from a7 to a8 and choose a queen.",
    fen: "7k/P7/8/8/8/8/8/7K w - - 0 1",
    hint: { from: "a7", to: "a8" },
    success:
      "a8=Q means your pawn became a queen. Promotions can turn a small pawn into a decisive advantage.",
    goal: "promotion",
  },
  {
    id: "mate",
    title: "10. Deliver checkmate",
    rule: "Checkmate means the king is in check and has no legal escape. That wins the game. If there are no legal moves but the king is not in check, it is stalemate—a draw.",
    task: "White to move. Find a queen move that checkmates Black. Your king protects the nearby squares.",
    fen: "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1",
    hint: { from: "g6", to: "g7" },
    success:
      "Checkmate! The king is attacked and cannot escape. You are ready to practice with a beginner bot and learn from the review.",
    goal: "mate",
  },
];
export function tryBeginnerMove(
  exercise: BeginnerExercise,
  from: string,
  to: string,
  promotion?: string,
) {
  const chess = new Chess(exercise.fen);
  try {
    const move = chess.move({ from, to, promotion });
    const correct =
      exercise.goal === "mate"
        ? chess.isCheckmate()
        : exercise.goal === "safe-king"
          ? move.piece === "k"
          : exercise.goal === "promotion"
            ? move.promotion === "q"
            : from === exercise.hint.from && to === exercise.hint.to;
    return {
      correct,
      fen: correct ? chess.fen() : exercise.fen,
      feedback: correct
        ? exercise.success
        : exercise.goal === "mate"
          ? chess.isStalemate()
            ? "That is stalemate: the king is not in check, so the game is drawn. Try a checking move."
            : "That move does not checkmate yet. Look for a check that leaves no escape."
          : "That move is legal, but it does not complete this task. Read the goal and try again.",
    };
  } catch {
    return {
      correct: false,
      fen: exercise.fen,
      feedback:
        "That move is not legal here. Select a piece to see its legal destinations.",
    };
  }
}
