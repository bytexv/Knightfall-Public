import { Chess, type Move } from "chess.js";
export const guidedOpening = [
  {
    move: "e4",
    reply: "e5",
    title: "Claim the center",
    goal: "Move your e-pawn two squares: e2 to e4.",
    why: "The pawn controls central squares and opens a diagonal for your bishop.",
    response: "The bot plays e5 to contest the center and open its own bishop.",
  },
  {
    move: "Nf3",
    reply: "Nc6",
    title: "Bring a knight into play",
    goal: "Move your knight from g1 to f3.",
    why: "The knight develops toward the center and attacks the pawn on e5.",
    response: "The bot develops its knight to c6, protecting e5.",
  },
  {
    move: "Bc4",
    reply: "Bc5",
    title: "Develop your bishop",
    goal: "Move your bishop from f1 to c4.",
    why: "The bishop has an open diagonal toward f7, near Black’s king.",
    response:
      "The bot brings its bishop to c5 and points it toward f2. Watch that diagonal.",
  },
  {
    move: "d3",
    reply: "Nf6",
    title: "Support your center",
    goal: "Move your d-pawn from d2 to d3.",
    why: "The pawn supports e4 and opens a path for your other bishop. This is one solid opening plan, not the only good move.",
    response:
      "The bot develops its second knight and attacks e4, which your d-pawn now protects.",
  },
  {
    move: "O-O",
    reply: "O-O",
    title: "Put your king in safety",
    goal: "Castle: move your king from e1 to g1. The rook moves with it.",
    why: "Castling shelters the king behind pawns and brings the rook toward the center. You may not castle through check.",
    response: "The bot castles too. Both kings have left the center.",
  },
  {
    move: "Nc3",
    reply: "d6",
    title: "Finish developing your knights",
    goal: "Move your knight from b1 to c3.",
    why: "Your second knight joins the center and helps defend e4. Next, look for a useful square for your bishop on c1.",
    response:
      "The bot supports e5 with d6. You have built a playable position: central pawns, active pieces, and a castled king.",
  },
] as const;
export function learningPosition(moves: readonly string[]) {
  const board = new Chess();
  for (const move of moves) board.move(move);
  return board;
}
export function learningGoal(board: Chess) {
  if (board.isCheckmate())
    return board.turn() === "w"
      ? "The bot delivered checkmate. Take back a turn to find a safer defense, or start again."
      : "Checkmate—you won! The king has no legal escape.";
  if (board.isStalemate())
    return "Stalemate: the player to move has no legal move but is not in check. The game is drawn.";
  if (board.isGameOver())
    return "This practice game is drawn. Start a new game to keep learning.";
  if (board.isCheck())
    return "Your king is in check. Move it to safety, capture the attacker, or block the attack.";
  if (board.history().length < 12)
    return "Look for a useful center move, develop a knight or bishop, and prepare to castle. Check what the bot threatens first.";
  return "Check the bot’s threats. Look at your checks, captures, and threats, then make sure your intended piece will be safe.";
}
export function explainLearningMove(move: Move, who: "You" | "The bot") {
  const names = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  if (move.san.endsWith("#"))
    return `${who} played ${move.san}: checkmate. The king is attacked and has no legal escape.`;
  if (move.isKingsideCastle() || move.isQueensideCastle())
    return `${who} castled, moving the king and rook together. Look for ways to keep the pawn shield intact.`;
  const action = move.promotion
    ? `promoted a pawn to a ${names[move.promotion]}`
    : move.captured
      ? `captured a ${names[move.captured]} with a ${names[move.piece]}`
      : `moved a ${names[move.piece]} to ${move.to}`;
  return `${who} played ${move.san} and ${action}.${move.san.endsWith("+") ? " This gives check; the next move must make the king safe." : move.captured ? " Check whether a recapture is possible." : " Look at the squares this piece now attacks."}`;
}
