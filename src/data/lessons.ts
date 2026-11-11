export type Lesson = {
  id: string;
  title: string;
  level: "Foundation" | "Building blocks" | "Practical chess";
  minutes: number;
  summary: string;
  sections: { title: string; body: string }[];
  challenge: string;
};

export const lessons: Lesson[] = [
  {
    id: "opening-principles",
    title: "Make your first ten moves count",
    level: "Foundation",
    minutes: 4,
    summary: "A simple opening plan that works even when you forget the moves.",
    sections: [
      {
        title: "Claim useful central squares",
        body: "Pawns on e4 or d4 help your pieces control the center. You do not need to occupy every central square, but your moves should help your pieces reach useful places.",
      },
      {
        title: "Develop with a purpose",
        body: "Bring knights and bishops into play before moving the same piece repeatedly. A move that develops a piece and creates a threat is especially useful—but do not chase a harmless queen at the expense of your position.",
      },
      {
        title: "Keep the king safe",
        body: "Castle when it improves king safety. Castling is only legal if the king and relevant rook have not moved, the path is clear, and the king is not in check or crossing an attacked square.",
      },
      {
        title: "Connect your rooks",
        body: "After the minor pieces are developed and your king is safe, find a useful queen square. Connected rooks can support each other and take over open files.",
      },
    ],
    challenge:
      "Play a practice game and try to develop both knights and both bishops before move ten, without making an unsafe move just to meet the target.",
  },
  {
    id: "blunder-check",
    title: "The ten-second blunder check",
    level: "Foundation",
    minutes: 3,
    summary: "One reliable habit before you let go of a piece.",
    sections: [
      {
        title: "What changed?",
        body: "After your opponent moves, ask what the moved piece now attacks and what it stopped defending. Sliding pieces may have gained a new line without moving themselves.",
      },
      {
        title: "Checks, captures, threats",
        body: "Look at your opponent’s forcing replies to your intended move: checks first, then captures, then direct threats. A tempting attack is not useful if your queen can be taken.",
      },
      {
        title: "Count attackers and defenders",
        body: "Count pieces, then calculate the order of captures. Counting alone is not enough when a defender is pinned, overloaded or unable to recapture safely.",
      },
    ],
    challenge:
      "Before each move in your next bot game, name the opponent’s strongest check or capture after your intended move.",
  },
  {
    id: "tactical-patterns",
    title: "See the tactic before the move",
    level: "Building blocks",
    minutes: 5,
    summary:
      "Forks, pins, skewers and discoveries share the same warning signs.",
    sections: [
      {
        title: "Loose pieces invite tactics",
        body: "An undefended piece can be the second target of a fork. Look for exposed kings, unprotected queens and rooks, and pieces that share a line or diagonal.",
      },
      {
        title: "Forks and double attacks",
        body: "One move attacks two targets. A checking fork is especially forcing because the opponent must answer the check before saving the other target.",
      },
      {
        title: "Pins and skewers",
        body: "A pinned piece cannot move without exposing something more valuable. A skewer attacks the valuable front piece first, revealing the target behind it. Only a pin to the king makes moving the pinned piece illegal.",
      },
      {
        title: "Discovered attacks",
        body: "Move one piece to reveal the attack of another. The moving piece can create a second threat, and a discovered check makes that second threat particularly powerful.",
      },
    ],
    challenge:
      "Solve five puzzles slowly. Before calculating, identify the undefended piece, alignment or exposed king that makes the tactic possible.",
  },
  {
    id: "calculate",
    title: "Calculate a short line clearly",
    level: "Building blocks",
    minutes: 5,
    summary: "Better candidate moves beat longer, unfocused guessing.",
    sections: [
      {
        title: "Find candidate moves",
        body: "Start with forcing checks, captures and threats. Then consider a developing or defensive move. You do not need to analyze every legal move with equal attention.",
      },
      {
        title: "Give the opponent their best reply",
        body: "A combination must work against strong defense. Ask which reply would most annoy you, and calculate that reply before the cooperative one.",
      },
      {
        title: "Stop at a stable position",
        body: "Do not evaluate halfway through a capture sequence. Continue until the immediate checks and captures settle, then count material and assess king safety.",
      },
      {
        title: "Recheck the first move",
        body: "Before playing, make one last scan for an unexpected check or capture. A beautiful final position cannot rescue an illegal or losing first move.",
      },
    ],
    challenge:
      "Pick a puzzle and write a three-ply line: your move, the best reply and your continuation. Then test it on the board.",
  },
  {
    id: "gambit-compensation",
    title: "What does a sacrificed pawn buy?",
    level: "Building blocks",
    minutes: 4,
    summary: "Understand compensation before learning a trap.",
    sections: [
      {
        title: "Time",
        body: "A gambit can lure the opponent into spending moves taking material while you develop. This advantage is temporary; use it to create concrete threats.",
      },
      {
        title: "Space and open lines",
        body: "Open files help rooks and queens. Open diagonals help bishops. A central pawn majority can restrict the opponent and support a later breakthrough.",
      },
      {
        title: "Lasting pressure",
        body: "Some gambits, such as the Benko, seek long-term positional pressure rather than immediate mate. Ask whether your compensation survives a queen trade.",
      },
      {
        title: "Know the exit",
        body: "A defender can return the extra pawn to finish development. Learn that response too. An opening is more than the trap that first made it interesting.",
      },
    ],
    challenge:
      "Open any gambit in the library. After the last move, identify exactly what the side that sacrificed material received in exchange.",
  },
  {
    id: "basic-endgames",
    title: "Turn an extra piece into a win",
    level: "Practical chess",
    minutes: 5,
    summary: "Activate the king, simplify carefully and watch for stalemate.",
    sections: [
      {
        title: "The king becomes a piece",
        body: "When queens and many pieces are gone, the king can safely join the fight. Centralize it and use it to support passed pawns.",
      },
      {
        title: "Trade with a reason",
        body: "When ahead, exchanging pieces often reduces counterplay. Do not automatically exchange pawns: you may need them to create a passed pawn and win.",
      },
      {
        title: "Keep the opposition in mind",
        body: "In king-and-pawn endings, whose turn it is can determine the result. Opposing kings cannot stand next to each other; that restriction creates opposition and key-square ideas.",
      },
      {
        title: "Avoid stalemate",
        body: "If the side to move has no legal move and is not in check, the game is drawn. Before tightening a mating net, make sure the opponent still has a legal move or is actually in checkmate.",
      },
    ],
    challenge:
      "Set up king and rook versus king. Practice driving the defending king toward an edge without checking on every move.",
  },
  {
    id: "review-games",
    title: "Review one game. Learn one thing.",
    level: "Practical chess",
    minutes: 4,
    summary: "Turn local engine analysis into a habit you can use.",
    sections: [
      {
        title: "Review before the engine",
        body: "Replay the game and mark the moments where you felt unsure. Write down what you were trying to achieve before looking at a suggested line.",
      },
      {
        title: "Compare plans, not just numbers",
        body: "An evaluation is an estimate for a position, not a complete explanation. Follow the principal variation and look for the concrete reason the engine prefers a move.",
      },
      {
        title: "Respect shallow searches",
        body: "Fast local analysis may miss deep tactics or change its evaluation with more time. A small numerical difference does not prove your move was bad.",
      },
      {
        title: "Choose one actionable lesson",
        body: "Find a repeated pattern: an undefended piece, an unsafe pawn move or a missed central break. Practice that pattern, then play another game.",
      },
    ],
    challenge:
      "Review your next completed game and save one sentence beginning, “Next time, I will check…”",
  },
  {
    id: "clock-management",
    title: "Make time work for you",
    level: "Practical chess",
    minutes: 3,
    summary: "A good move played in time is part of good chess.",
    sections: [
      {
        title: "Spend time at turning points",
        body: "Use more time when there are forcing tactics, a major pawn break or a choice of plans. Familiar recaptures may require less, but still deserve a safety check.",
      },
      {
        title: "Use the opponent’s clock",
        body: "While the opponent thinks, assess the position and consider likely replies. When their move arrives, verify what changed before using the plan you prepared.",
      },
      {
        title: "Understand increment",
        body: "In a 5+3 game, each player starts with five minutes and receives three seconds after making a move. Increment can help you avoid a desperate scramble if you keep decisions manageable.",
      },
    ],
    challenge:
      "Play one 10+5 game. Notice which decisions consume the most time, and review those positions afterward.",
  },
  {
    id: "special-moves",
    title: "Three rules worth knowing cold",
    level: "Foundation",
    minutes: 4,
    summary: "Castling, en passant and promotion without the surprises.",
    sections: [
      {
        title: "Castling",
        body: "Move the king two squares toward a rook, and the rook goes to the square the king crossed. Neither piece may have moved before. The squares between them must be clear, and the king may not start in, pass through or finish in check. The rook may be attacked.",
      },
      {
        title: "En passant",
        body: "If a pawn advances two squares from its starting rank and lands beside an enemy pawn, that enemy pawn may capture it as though it advanced only one square. This special capture is available only on the very next move, and only if it does not leave the capturing side’s king in check.",
      },
      {
        title: "Promotion",
        body: "A pawn that reaches the last rank must become a queen, rook, bishop or knight of the same color. You may choose a piece even if you already have one on the board. Sometimes a knight promotion is the only winning move.",
      },
    ],
    challenge:
      "Set up an en passant opportunity on the analysis board, then make another move first. Notice that the special capture is no longer available.",
  },
];
