/**
 * Original educational starting positions, verified against the public Lichess
 * Syzygy tablebase API on 2026-11-11. The embedded result is for the side to move;
 * playerColor equals that side in every drill. A move's tablebase category is
 * from the opponent's perspective, so 'loss' preserves the player's win.
 * These are static verification snapshots. Practice and analysis run locally;
 * no tablebase API is contacted by the application at runtime.
 */
export type EndgameDrill = {
  id: string;
  title: string;
  description: string;
  fen: string;
  playerColor: "w" | "b";
  goal: string;
  lesson: string;
  tags: string[];
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  category: "Checkmate technique" | "Pawn endings" | "Rook endings";
  objective: "win" | "draw";
  plan: string[];
  commonMistake: string;
  verification: {
    category: "win" | "draw";
    dtz: number;
    dtm: number | null;
    bestMove: string;
    preservingMoves: string[];
    sourceUrl: string;
    checkedAt: string;
  };
};

export const endgameVerification = {
  name: "Lichess Syzygy tablebases",
  url: "https://syzygy-tables.info/",
  checkedAt: "2026-11-11",
  note: "Starting-position outcomes were checked with perfect-play endgame tablebases. The local practice bot searches on your device and does not use these tablebases.",
};

export const endgames: EndgameDrill[] = [
  {
    id: "queen-box",
    title: "A queen, a king, a smaller box",
    description:
      "Turn a decisive material advantage into a calm, controlled checkmate.",
    playerColor: "w",
    goal: "Checkmate with your king and queen.",
    lesson:
      "Your queen can fence the enemy king into a smaller area. Bring your own king close enough to support the final mating net, and leave the opponent a legal move until you are ready to give mate.",
    tags: ["Queen", "King activity", "Stalemate awareness"],
    difficulty: "Beginner",
    category: "Checkmate technique",
    objective: "win",
    plan: [
      "Use the queen to reduce the king’s available ranks and files.",
      "Bring your king closer while the queen keeps the opposing king contained.",
      "Finish at the edge with a protected checking piece. Check for stalemate before every quiet queen move.",
    ],
    commonMistake:
      "Taking away every escape square without giving check is stalemate, not checkmate.",
    fen: "8/8/8/3k4/8/5K2/1Q6/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 13,
      dtm: 13,
      bestMove: "b2c1",
      preservingMoves: [
        "b2c1",
        "b2c2",
        "b2c3",
        "b2b5",
        "b2b6",
        "b2f6",
        "b2a1",
        "b2a2",
        "b2d2",
        "b2e2",
        "b2f2",
        "b2g2",
        "b2h2",
        "b2a3",
        "b2b3",
        "b2b4",
        "b2b7",
        "b2g7",
        "b2b8",
        "b2h8",
        "f3e3",
        "f3f4",
        "f3g4",
        "b2b1",
        "f3e2",
        "f3f2",
        "f3g2",
        "f3g3",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/8/3k4/8/5K2/1Q6/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "rook-box",
    title: "The rook-and-king finish",
    description:
      "Learn to make the box smaller with two pieces working together.",
    playerColor: "w",
    goal: "Checkmate with your king and rook.",
    lesson:
      "A rook cuts the board into sections, but it needs its king to force the defender toward an edge. Improve the king first when a rook check would merely send the opponent back toward the center.",
    tags: ["Rook", "King activity", "Cutting off"],
    difficulty: "Beginner",
    category: "Checkmate technique",
    objective: "win",
    plan: [
      "Use a rank or file to keep the enemy king in one part of the board.",
      "Bring your king into opposition and take away the next row of squares.",
      "Use a waiting rook move if needed, then check the king toward the edge.",
    ],
    commonMistake:
      "A rook left next to the opposing king can be captured. Keep it protected or safely distant.",
    fen: "8/8/6k1/8/8/2K5/5R2/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 19,
      dtm: 19,
      bestMove: "c3d3",
      preservingMoves: [
        "c3d3",
        "c3d4",
        "f2f1",
        "c3d2",
        "c3c4",
        "f2f3",
        "f2f4",
        "f2f8",
        "c3c2",
        "f2a2",
        "f2b2",
        "f2c2",
        "f2d2",
        "f2e2",
        "f2g2",
        "f2h2",
        "c3b2",
        "c3b3",
        "c3b4",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/6k1/8/8/2K5/5R2/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "ladder-mate",
    title: "Two rooks, one ladder",
    description: "One rook builds the wall. The other takes the next step.",
    playerColor: "w",
    goal: "Deliver a ladder checkmate.",
    lesson:
      "Your rooks can work without help from the king. One rook cuts off a rank while the other gives check on the next rank, steadily pushing the defender to the edge.",
    tags: ["Two rooks", "Coordination", "Ladder mate"],
    difficulty: "Beginner",
    category: "Checkmate technique",
    objective: "win",
    plan: [
      "Keep the rooks on different ranks so they do not obstruct one another.",
      "Use one rook to restrict the king and the other to check.",
      "If the king approaches a rook, move that rook safely across the board before continuing.",
    ],
    commonMistake:
      "Do not put an unprotected rook within the enemy king’s reach.",
    fen: "7k/8/8/8/3R4/4R3/8/K7 w - - 0 1",
    verification: {
      category: "win",
      dtz: 3,
      dtm: 3,
      bestMove: "e3g3",
      preservingMoves: [
        "e3g3",
        "e3e7",
        "d4g4",
        "d4d7",
        "e3f3",
        "d4f4",
        "e3e6",
        "d4d6",
        "d4d1",
        "d4d2",
        "e3e8",
        "d4d8",
        "e3e1",
        "e3e2",
        "e3a3",
        "e3b3",
        "e3c3",
        "e3d3",
        "e3h3",
        "d4a4",
        "d4b4",
        "d4c4",
        "d4e4",
        "d4h4",
        "a1b1",
        "a1a2",
        "a1b2",
        "e3e4",
        "e3e5",
        "d4d3",
        "d4d5",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=7k/8/8/8/3R4/4R3/8/K7%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "two-bishops",
    title: "The two-bishop squeeze",
    description: "Use both colors of squares to close the net.",
    playerColor: "w",
    goal: "Checkmate with your king and two bishops.",
    lesson:
      "The bishops cover complementary diagonals. Together with an active king, they can restrict the defender and push it toward an edge; the king is essential for taking away the last escape squares.",
    tags: ["Bishop pair", "Diagonals", "Coordination"],
    difficulty: "Intermediate",
    category: "Checkmate technique",
    objective: "win",
    plan: [
      "Keep both bishops safe and use their diagonals to form a barrier.",
      "Advance your king while the bishops reduce the defender’s space.",
      "Drive the king toward a corner and coordinate both bishops for the finish.",
    ],
    commonMistake:
      "Checks that open a route back to the center make the job harder. Restriction matters more than constant checking.",
    fen: "6k1/8/8/8/4K3/2B2B2/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 17,
      dtm: 17,
      bestMove: "c3f6",
      preservingMoves: [
        "c3f6",
        "e4f5",
        "f3h5",
        "e4d5",
        "c3a1",
        "c3e1",
        "c3b2",
        "c3d2",
        "c3b4",
        "c3d4",
        "c3a5",
        "c3e5",
        "f3d1",
        "f3e2",
        "f3g4",
        "e4f4",
        "e4e5",
        "f3h1",
        "f3g2",
        "e4d4",
        "e4d3",
        "e4e3",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=6k1/8/8/8/4K3/2B2B2/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "bishop-knight",
    title: "Bishop and knight: find the right corner",
    description:
      "A precise coordination challenge for the ambitious endgame student.",
    playerColor: "w",
    goal: "Checkmate with your king, bishop and knight.",
    lesson:
      "Bishop-and-knight mate is possible, but the final mating corner must match the bishop’s square color. Here the bishop is on a light square, so the target corners are a8 and h1—not the king’s current corner on h8.",
    tags: ["Bishop and knight", "Correct corner", "Advanced technique"],
    difficulty: "Advanced",
    category: "Checkmate technique",
    objective: "win",
    plan: [
      "Bring your king close enough to restrict the enemy king.",
      "Use the knight to cover squares the bishop cannot control.",
      "Transfer the defender from the wrong-colored corner toward a8 or h1, keeping your pieces coordinated.",
    ],
    commonMistake:
      "A bishop cannot control the opposite-colored corner. This drill needs careful calculation; use local analysis when you get stuck.",
    fen: "7k/8/5KB1/4N3/8/8/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 39,
      dtm: 39,
      bestMove: "e5f7",
      preservingMoves: [
        "e5f7",
        "g6b1",
        "g6c2",
        "g6d3",
        "g6e4",
        "g6f5",
        "g6f7",
        "e5d3",
        "e5f3",
        "e5c4",
        "e5g4",
        "e5c6",
        "e5d7",
        "g6h5",
        "g6e8",
        "f6f5",
        "f6g5",
        "f6e6",
        "f6e7",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=7k/8/5KB1/4N3/8/8/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "key-squares",
    title: "Keep your king in front",
    description: "A small king move decides whether the pawn becomes a queen.",
    playerColor: "w",
    goal: "Promote the e-pawn and convert the win.",
    lesson:
      "Your king has reached the sixth rank in front of a central pawn. Keep that advantage with a sideways step to d6 or f6, then use your king to support the pawn’s advance.",
    tags: ["Key squares", "King and pawn", "Opposition"],
    difficulty: "Beginner",
    category: "Pawn endings",
    objective: "win",
    plan: [
      "Keep the king ahead of the pawn instead of retreating behind it.",
      "Use a lateral king move to gain access to the seventh rank.",
      "Advance the pawn only when its next square and promotion route are secure.",
    ],
    commonMistake:
      "In this exact position, retreating to d5 or f5 gives away the win.",
    fen: "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 3,
      dtm: 21,
      bestMove: "e6d6",
      preservingMoves: ["e6d6", "e6f6"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=4k3/8/4K3/4P3/8/8/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "opposition-draw",
    title: "Take the opposition",
    description: "Find the one king move that keeps the draw.",
    playerColor: "b",
    goal: "Hold the draw as Black.",
    lesson:
      "The attacking king wants to reach key squares in front of its pawn. Meet it head-on: ...Ke6 places the kings on the same file with one square between them and makes White move first.",
    tags: ["Opposition", "Defense", "King and pawn"],
    difficulty: "Intermediate",
    category: "Pawn endings",
    objective: "draw",
    plan: [
      "Start with ...Ke6 to take the direct opposition.",
      "Keep your king in front of the pawn and deny the attacking king a route around you.",
      "Respond to king moves and pawn advances carefully; do not step away from the key squares without a reason.",
    ],
    commonMistake:
      "Every other legal first move loses with perfect play. A single king tempo can decide a pawn ending.",
    fen: "8/8/3k4/8/4K3/4P3/8/8 b - - 0 1",
    verification: {
      category: "draw",
      dtz: 0,
      dtm: 0,
      bestMove: "d6e6",
      preservingMoves: ["d6e6"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/3k4/8/4K3/4P3/8/8%20b%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "rook-pawn-corner",
    title: "The rook-pawn exception",
    description: "Sometimes the corner is the safest place on the board.",
    playerColor: "b",
    goal: "Hold the draw against the rook pawn.",
    lesson:
      "A rook pawn has only one neighboring file, which limits the attacking king’s ability to force you out. Stay near a8, the pawn’s promotion corner; White cannot force a win from this position.",
    tags: ["Rook pawn", "Corner defense", "Drawing technique"],
    difficulty: "Beginner",
    category: "Pawn endings",
    objective: "draw",
    plan: [
      "Keep your king on a8 or b8 whenever it is legal and safe.",
      "Do not let the attacking king force you away from the promotion corner.",
      "Watch for stalemate: having no legal move while not in check secures the draw.",
    ],
    commonMistake:
      "Leaving the corner voluntarily can give the attacking king the space it needs.",
    fen: "k7/8/PK6/8/8/8/8/8 b - - 0 1",
    verification: {
      category: "draw",
      dtz: 0,
      dtm: 0,
      bestMove: "a8b8",
      preservingMoves: ["a8b8"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=k7/8/PK6/8/8/8/8/8%20b%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "wrong-bishop",
    title: "The wrong-colored bishop",
    description: "A whole extra bishop still cannot unlock this corner.",
    playerColor: "b",
    goal: "Hold the draw against bishop and rook pawn.",
    lesson:
      "White’s bishop travels on dark squares, but the a-pawn promotes on the light square a8. With your king established at that corner, the bishop cannot control the square it needs to force you away.",
    tags: ["Wrong bishop", "Rook pawn", "Fortress"],
    difficulty: "Intermediate",
    category: "Pawn endings",
    objective: "draw",
    plan: [
      "Keep returning to the a8 promotion corner when possible.",
      "Avoid being lured far away by a bishop move or a pawn capture.",
      "Use the edge and stalemate possibilities to keep the position closed.",
    ],
    commonMistake:
      "The drawing rule depends on the bishop’s color and the defender’s access to the corner. It is not a draw for every bishop-and-rook-pawn position.",
    fen: "k7/8/PK6/8/1B6/8/8/8 b - - 0 1",
    verification: {
      category: "draw",
      dtz: 0,
      dtm: 0,
      bestMove: "a8b8",
      preservingMoves: ["a8b8"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=k7/8/PK6/8/1B6/8/8/8%20b%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "outside-passer",
    title: "Make the king choose",
    description: "A distant passed pawn creates a problem on the other wing.",
    playerColor: "w",
    goal: "Use the outside passed pawn to win.",
    lesson:
      "The h-pawn is far from the queenside king battle. Push it to create a threat the opposing king cannot comfortably handle while your king remains active on the other side.",
    tags: ["Outside passed pawn", "Two weaknesses", "King activity"],
    difficulty: "Intermediate",
    category: "Pawn endings",
    objective: "win",
    plan: [
      "Use the h-pawn’s distance to force the defender to make a choice.",
      "Count the moves to promotion before spending a tempo on a king move.",
      "If the king abandons the queenside, consider whether your king can collect the remaining pawn.",
    ],
    commonMistake:
      "A passed pawn is useful because of the threat it creates. Do not trade away the advantage without checking the resulting king-and-pawn ending.",
    fen: "8/8/2k5/p7/P1K4P/8/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 1,
      dtm: 21,
      bestMove: "h4h5",
      preservingMoves: ["h4h5", "c4d4", "c4b3", "c4c3", "c4d3"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/2k5/p7/P1K4P/8/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "square-rule",
    title: "Count the race",
    description: "The pawn can escape—but only if you start running now.",
    playerColor: "w",
    goal: "Promote the h-pawn and convert the win.",
    lesson:
      "Imagine a square from the pawn to its promotion rank. The defending king is just too far away if you push now. In this position, h5 preserves the win; spending a move on your king lets the defender catch the pawn.",
    tags: ["Rule of the square", "Tempo", "Pawn race"],
    difficulty: "Beginner",
    category: "Pawn endings",
    objective: "win",
    plan: [
      "Count the pawn moves required to reach h8, including the promotion move.",
      "Count the opposing king’s quickest route, remembering that it can move diagonally.",
      "Push h5 now and keep checking the race before each advance.",
    ],
    commonMistake:
      "A single waiting move changes the result. The rule of the square must account for whose turn it is.",
    fen: "8/8/2k5/8/7P/8/8/K7 w - - 0 1",
    verification: {
      category: "win",
      dtz: 1,
      dtm: 25,
      bestMove: "h4h5",
      preservingMoves: ["h4h5"],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/2k5/8/7P/8/8/K7%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "pawn-race",
    title: "The first queen is not the finish line",
    description: "Win the race, then stop the other runner.",
    playerColor: "w",
    goal: "Promote first and prevent Black’s counter-promotion.",
    lesson:
      "Your a-pawn is closer to promotion than Black’s h-pawn. Once you have a queen, look for a forcing check or a move that both attacks the king and controls the enemy pawn’s route.",
    tags: ["Pawn race", "Promotion", "Forcing moves"],
    difficulty: "Intermediate",
    category: "Pawn endings",
    objective: "win",
    plan: [
      "Advance the a-pawn while tracking Black’s h-pawn.",
      "After promotion, examine checks before quiet queen moves.",
      "Use the queen’s long-range control to stop the remaining pawn, then finish the king-and-queen ending.",
    ],
    commonMistake:
      "Do not celebrate promotion and overlook an immediate counter-promotion on the next move.",
    fen: "8/8/P4k2/8/7p/3K4/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 1,
      dtm: 21,
      bestMove: "a6a7",
      preservingMoves: [
        "a6a7",
        "d3c4",
        "d3d4",
        "d3c3",
        "d3e3",
        "d3c2",
        "d3d2",
        "d3e2",
        "d3e4",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/P4k2/8/7p/3K4/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "connected-passers",
    title: "Let the pawns help each other",
    description: "Connected passed pawns can keep a king very busy.",
    playerColor: "w",
    goal: "Promote a pawn and convert the win.",
    lesson:
      "Two connected passed pawns can support one another and make a capture costly. Advance with care: when the king takes one pawn, the other may be able to promote beyond its reach.",
    tags: ["Connected passers", "Pawn support", "Calculation"],
    difficulty: "Intermediate",
    category: "Pawn endings",
    objective: "win",
    plan: [
      "Compare a6 and b6 and calculate the king’s reply before advancing.",
      "Keep the pawns close enough to support one another or create an unstoppable runner.",
      "Bring your king closer when needed instead of pushing automatically.",
    ],
    commonMistake:
      "Connected pawns are strong, but careless advances can leave both within the defending king’s reach.",
    fen: "8/8/3k4/PP6/5K2/8/8/8 w - - 0 1",
    verification: {
      category: "win",
      dtz: 1,
      dtm: 21,
      bestMove: "a5a6",
      preservingMoves: [
        "a5a6",
        "b5b6",
        "f4e3",
        "f4e4",
        "f4f3",
        "f4f5",
        "f4g3",
        "f4g4",
        "f4g5",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=8/8/3k4/PP6/5K2/8/8/8%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "lucena-bridge",
    title: "Lucena: build a bridge",
    description: "Help your king step out of the promotion square.",
    playerColor: "w",
    goal: "Shield your king from checks, promote and win.",
    lesson:
      "Your king stands in front of a seventh-rank pawn, while your rook cuts off the defending king. This is the Lucena pattern: use the rook to shelter your king from side checks so the pawn can promote.",
    tags: ["Lucena", "Building a bridge", "Rook and pawn"],
    difficulty: "Advanced",
    category: "Rook endings",
    objective: "win",
    plan: [
      "Keep the defending king cut off from the pawn.",
      "Consider a rook lift such as Re4 to prepare a shield against horizontal checks.",
      "Bring the king out, use the rook to block checks at the right moment, and clear the promotion square.",
    ],
    commonMistake:
      "Do not place the rook where it can simply be captured or where it no longer helps the pawn. The exact sequence depends on Black’s checks.",
    fen: "3K4/3P1k2/8/8/8/8/r7/4R3 w - - 0 1",
    verification: {
      category: "win",
      dtz: 9,
      dtm: 37,
      bestMove: "e1f1",
      preservingMoves: [
        "e1f1",
        "e1c1",
        "e1e7",
        "e1b1",
        "e1d1",
        "e1e3",
        "e1e4",
        "e1e5",
        "e1g1",
        "e1h1",
        "d8c7",
        "d8c8",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=3K4/3P1k2/8/8/8/8/r7/4R3%20w%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
  {
    id: "philidor-defense",
    title: "Philidor: hold the sixth rank",
    description: "An active rook can save a pawn-down ending.",
    playerColor: "b",
    goal: "Hold the draw with the Philidor defensive idea.",
    lesson:
      "Your king blocks the pawn’s route while the rook keeps the attacking king away from the sixth rank. When the pawn advances far enough, switch to checking from behind instead of defending passively.",
    tags: ["Philidor", "Active defense", "Rook and pawn"],
    difficulty: "Advanced",
    category: "Rook endings",
    objective: "draw",
    plan: [
      "Keep the rook on a safe sixth-rank square such as b6, c6 or g6 while it restricts the enemy king.",
      "Avoid squares where the attacking king or rook can capture your rook.",
      "When the pawn reaches the sixth rank, look for rear checks that drive the king away from its pawn.",
    ],
    commonMistake:
      "A passive rook on the back rank can lose the draw. Stay active, but calculate every checking distance and capture.",
    fen: "4k3/R7/7r/4K3/4P3/8/8/8 b - - 0 1",
    verification: {
      category: "draw",
      dtz: 0,
      dtm: 0,
      bestMove: "h6h1",
      preservingMoves: [
        "h6h1",
        "h6h2",
        "h6h3",
        "h6h4",
        "h6h5",
        "h6b6",
        "h6c6",
        "h6g6",
        "e8d8",
        "e8f8",
      ],
      sourceUrl:
        "https://tablebase.lichess.ovh/standard?fen=4k3/R7/7r/4K3/4P3/8/8/8%20b%20-%20-%200%201",
      checkedAt: "2026-11-11",
    },
  },
];
