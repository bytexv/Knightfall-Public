import { Chess } from "chess.js";
import { puzzles } from "./puzzles";
export type QuizTopic = "Rules" | "Strategy" | "Tactics" | "Endgames";
export interface QuizQuestion {
  id: string;
  topic: QuizTopic;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  fen?: string;
  move?: string;
}
const concepts: QuizQuestion[] = [
  {
    id: "concept-01",
    topic: "Rules",
    prompt: "How does a knight move?",
    choices: [
      "Two squares in one direction, then one sideways",
      "Only along diagonals",
      "Any distance in a straight line",
      "One square in any direction",
    ],
    answer: "Two squares in one direction, then one sideways",
    explanation: "A knight moves in an L shape and can jump over other pieces.",
  },
  {
    id: "concept-02",
    topic: "Rules",
    prompt: "Which piece may jump over occupied squares?",
    choices: ["A knight", "A bishop", "A rook", "A queen"],
    answer: "A knight",
    explanation: "Knights jump. A bishop, rook or queen needs a clear path.",
  },
  {
    id: "concept-03",
    topic: "Rules",
    prompt: "What is checkmate?",
    choices: [
      "The king is in check and there is no legal way to escape",
      "The king cannot move, even though another piece can",
      "A queen has been captured",
      "Both players have only one piece",
    ],
    answer: "The king is in check and there is no legal way to escape",
    explanation:
      "Checkmate ends the game. Capturing the attacker, blocking the attack and moving the king are all unavailable.",
  },
  {
    id: "concept-04",
    topic: "Rules",
    prompt: "What is stalemate?",
    choices: [
      "The player to move is not in check and has no legal move",
      "A king is attacked by two pieces",
      "Both queens are gone",
      "A player repeats one move",
    ],
    answer: "The player to move is not in check and has no legal move",
    explanation:
      "Stalemate is a draw. Checkmate requires the king to be in check.",
  },
  {
    id: "concept-05",
    topic: "Rules",
    prompt: "Can a king move onto a square attacked by an enemy piece?",
    choices: [
      "No",
      "Yes, if it captures a piece",
      "Yes, if the attacker is a pawn",
      "Only when castling",
    ],
    answer: "No",
    explanation:
      "A king may never move into check. This also applies when it captures.",
  },
  {
    id: "concept-06",
    topic: "Rules",
    prompt: "When a pawn reaches the last rank, which promotion is allowed?",
    choices: [
      "Queen, rook, bishop or knight",
      "Queen only",
      "Any piece, including a king",
      "Only a previously captured piece",
    ],
    answer: "Queen, rook, bishop or knight",
    explanation:
      "You may choose any queen, rook, bishop or knight. You do not need to have lost that piece first.",
  },
  {
    id: "concept-07",
    topic: "Rules",
    prompt: "When is an en passant capture available?",
    choices: [
      "Immediately after an adjacent enemy pawn advances two squares",
      "Any time a pawn reaches the fifth rank",
      "After an enemy pawn moves one square",
      "At any later turn in the game",
    ],
    answer: "Immediately after an adjacent enemy pawn advances two squares",
    explanation:
      "The special capture is available only on the very next move, when all the position requirements are met.",
  },
  {
    id: "concept-08",
    topic: "Rules",
    prompt: "May you castle while your king is in check?",
    choices: [
      "No",
      "Yes, on the queenside only",
      "Yes, if the rook is safe",
      "Yes, once per game",
    ],
    answer: "No",
    explanation:
      "Castling cannot begin in check, pass through check, or finish in check.",
  },
  {
    id: "concept-09",
    topic: "Rules",
    prompt:
      "May a king and rook castle after the king moved away and returned?",
    choices: [
      "No",
      "Yes, if they are back on their original squares",
      "Yes, if neither piece was captured",
      "Only in an endgame",
    ],
    answer: "No",
    explanation: "Castling rights are lost permanently when the king moves.",
  },
  {
    id: "concept-10",
    topic: "Rules",
    prompt: "How do pawns normally capture?",
    choices: [
      "One square diagonally forward",
      "One square straight forward",
      "One square directly sideways",
      "In any adjacent direction",
    ],
    answer: "One square diagonally forward",
    explanation:
      "Pawns move straight forward but capture diagonally forward. En passant has its own special rule.",
  },
  {
    id: "concept-11",
    topic: "Rules",
    prompt: "What must stay the same for threefold repetition?",
    choices: [
      "The position, side to move and available legal possibilities",
      "Only the placement of the kings",
      "Only the last move played",
      "The move numbers",
    ],
    answer: "The position, side to move and available legal possibilities",
    explanation:
      "The same piece placement alone is not sufficient: the same player must move and rights such as castling matter.",
  },
  {
    id: "concept-12",
    topic: "Rules",
    prompt: "What resets the fifty-move count?",
    choices: [
      "A pawn move or a capture",
      "A check",
      "Castling",
      "A queen move",
    ],
    answer: "A pawn move or a capture",
    explanation:
      "The fifty-move rule counts moves by each side without a pawn move or a capture.",
  },
  {
    id: "concept-13",
    topic: "Strategy",
    prompt: "What is a useful opening priority?",
    choices: [
      "Develop pieces and make your king safe",
      "Move your queen as often as possible",
      "Push every edge pawn",
      "Avoid controlling the center",
    ],
    answer: "Develop pieces and make your king safe",
    explanation:
      "Active pieces, central influence and king safety give your position a sound foundation.",
  },
  {
    id: "concept-14",
    topic: "Strategy",
    prompt: "Before choosing a move, what should you check first?",
    choices: [
      "Your opponent\u2019s immediate threats",
      "Only the move you planned last turn",
      "Whether your rook has moved yet",
      "The color of the corner squares",
    ],
    answer: "Your opponent\u2019s immediate threats",
    explanation:
      "Ask what changed with the last move. A direct threat can matter more than your original plan.",
  },
  {
    id: "concept-15",
    topic: "Strategy",
    prompt: "What is a loose piece?",
    choices: [
      "A piece without protection",
      "A piece that has moved twice",
      "A pawn on the edge of the board",
      "A piece that cannot give check",
    ],
    answer: "A piece without protection",
    explanation:
      "Unprotected pieces are common tactical targets. Look for ways to attack more than one at once.",
  },
  {
    id: "concept-16",
    topic: "Strategy",
    prompt: "What is a fork?",
    choices: [
      "One piece attacking two or more targets",
      "Two pieces defending the same pawn",
      "Trading a rook for a queen",
      "Moving a bishop along an open diagonal",
    ],
    answer: "One piece attacking two or more targets",
    explanation:
      "A fork creates multiple threats. Knights, pawns, queens and other pieces can all fork.",
  },
  {
    id: "concept-17",
    topic: "Strategy",
    prompt: "What is an absolute pin?",
    choices: [
      "A piece cannot legally move because it would expose its king",
      "A rook is trapped by its own pawns",
      "A queen is under attack",
      "A pawn cannot advance because a piece blocks it",
    ],
    answer: "A piece cannot legally move because it would expose its king",
    explanation:
      "A pinned piece shields its king from attack. It cannot move if doing so leaves that king in check.",
  },
  {
    id: "concept-18",
    topic: "Strategy",
    prompt: "What is a skewer?",
    choices: [
      "An attack on a valuable front piece with another target behind it",
      "A knight jumping over a pawn",
      "A pawn capturing en passant",
      "A king defending a rook",
    ],
    answer: "An attack on a valuable front piece with another target behind it",
    explanation:
      "When the front piece moves, the piece behind it becomes vulnerable.",
  },
  {
    id: "concept-19",
    topic: "Strategy",
    prompt: "What is a discovered attack?",
    choices: [
      "Moving one piece reveals an attack from another",
      "Capturing an undefended piece",
      "Promoting a pawn",
      "Repeating the same check",
    ],
    answer: "Moving one piece reveals an attack from another",
    explanation:
      "The moved piece uncovers a bishop, rook or queen\u2019s line. It may make a second threat at the same time.",
  },
  {
    id: "concept-20",
    topic: "Strategy",
    prompt: "What is an open file?",
    choices: [
      "A file containing no pawns of either color",
      "A diagonal with no pieces",
      "A file with no white pawns only",
      "Any file occupied by a rook",
    ],
    answer: "A file containing no pawns of either color",
    explanation:
      "Rooks often become active on open files, where pawns do not block their reach.",
  },
  {
    id: "concept-21",
    topic: "Strategy",
    prompt: "Which forcing moves are worth checking early in calculation?",
    choices: [
      "Checks, captures and direct threats",
      "Only pawn moves",
      "Only quiet king moves",
      "Only moves to the edge",
    ],
    answer: "Checks, captures and direct threats",
    explanation:
      "Forcing moves restrict the opponent\u2019s replies. They are useful candidates, but still need calculation.",
  },
  {
    id: "concept-22",
    topic: "Strategy",
    prompt: "When ahead in material, what is a sensible trade?",
    choices: [
      "A favorable trade that preserves your advantage",
      "Every available trade, regardless of position",
      "Only trading pawns, never pieces",
      "Sacrificing the extra material immediately",
    ],
    answer: "A favorable trade that preserves your advantage",
    explanation:
      "Simplification can help, but king safety, pawn structure and the resulting endgame still matter.",
  },
  {
    id: "concept-23",
    topic: "Strategy",
    prompt: "What should you do after finding an attractive move?",
    choices: [
      "Look for the opponent\u2019s strongest reply",
      "Play it before considering any reply",
      "Assume the opponent will cooperate",
      "Stop calculating if it gives check",
    ],
    answer: "Look for the opponent\u2019s strongest reply",
    explanation:
      "A good move must withstand the opponent\u2019s best defense, not just the reply you hope for.",
  },
  {
    id: "concept-24",
    topic: "Strategy",
    prompt: "What does it mean to improve your worst-placed piece?",
    choices: [
      "Give an inactive piece a useful square or job",
      "Always exchange your queen",
      "Move the same active knight again",
      "Advance a random pawn",
    ],
    answer: "Give an inactive piece a useful square or job",
    explanation:
      "When there is no urgent tactic, bringing an idle piece into play often improves coordination.",
  },
  {
    id: "concept-25",
    topic: "Endgames",
    prompt: "Why does the king become more active in many endgames?",
    choices: [
      "With fewer attackers, it can help fight for squares and pawns",
      "It can move two squares at a time",
      "It can ignore check",
      "Pawns stop attacking it",
    ],
    answer: "With fewer attackers, it can help fight for squares and pawns",
    explanation:
      "The king becomes a fighting piece when immediate mating threats are reduced. It must still stay out of check.",
  },
  {
    id: "concept-26",
    topic: "Endgames",
    prompt: "What is a passed pawn?",
    choices: [
      "A pawn with no enemy pawn ahead on its file or adjacent files",
      "Any pawn on the fourth rank",
      "A pawn that has captured twice",
      "A pawn protected by a bishop",
    ],
    answer: "A pawn with no enemy pawn ahead on its file or adjacent files",
    explanation:
      "Enemy pawns cannot block or capture a passed pawn from in front, so it can become a promotion threat.",
  },
  {
    id: "concept-27",
    topic: "Endgames",
    prompt: "Can king and bishop force checkmate against a bare king?",
    choices: [
      "No",
      "Yes, from every legal position",
      "Only if the bishop is on a light square",
      "Only after fifty moves",
    ],
    answer: "No",
    explanation:
      "King and one bishop cannot checkmate a bare king. There is insufficient mating material.",
  },
  {
    id: "concept-28",
    topic: "Endgames",
    prompt:
      "Which pair can force checkmate against a bare king with correct play?",
    choices: [
      "King and rook",
      "King and one knight",
      "King and one bishop",
      "Two kings",
    ],
    answer: "King and rook",
    explanation:
      "A rook and king can force mate with correct play from a legal, nonterminal position. Avoid stalemate.",
  },
  {
    id: "concept-29",
    topic: "Endgames",
    prompt: "What is opposition in a simple king-and-pawn ending?",
    choices: [
      "Kings facing each other with a square between them, where the move matters",
      "Bishops on opposite-colored squares",
      "Two pawns attacking each other",
      "A rook behind a pawn",
    ],
    answer:
      "Kings facing each other with a square between them, where the move matters",
    explanation:
      "In direct opposition, the player to move often has to give way. The exact pawn position still decides whether that helps.",
  },
  {
    id: "concept-30",
    topic: "Endgames",
    prompt: "Before taking the last enemy pawn, what should you watch for?",
    choices: [
      "Accidentally leaving the enemy king stalemated",
      "The enemy king being able to castle",
      "Your king changing color",
      "A rook turning into a queen",
    ],
    answer: "Accidentally leaving the enemy king stalemated",
    explanation:
      "Winning material is not enough if the opponent then has no legal move and is not in check: that is stalemate.",
  },
];
concepts.push({
  id: "concept-31",
  topic: "Rules",
  prompt: "How does a bishop move?",
  choices: [
    "Any distance along an unobstructed diagonal",
    "In an L shape",
    "Only one square forward",
    "Along files and ranks",
  ],
  answer: "Any distance along an unobstructed diagonal",
  explanation:
    "A bishop stays on the same color of squares for the entire game and cannot jump over pieces.",
});
// Use verified source positions. Every distractor is legal and explicitly NOT mate,
// so another valid mating move is never marked wrong.
const mates: QuizQuestion[] = puzzles
  .flatMap((puzzle) => {
    if (puzzle.solution.length !== 1) return [];
    const board = new Chess(puzzle.fen),
      solution = puzzle.solution[0];
    const legal = board.moves({ verbose: true });
    const correct = legal.find(
      (m) => m.from + m.to + (m.promotion || "") === solution,
    );
    const wrong = legal.filter((m) => !m.san.endsWith("#")).slice(0, 3);
    if (!correct?.san.endsWith("#") || wrong.length < 3) return [];
    // Check/mate suffixes would give the answer away before the player looks
    // at the position. The underlying UCI move still verifies the solution.
    const answerText = (san: string) => san.replace(/[+#]$/, "");
    return [
      {
        id: `mate-${puzzle.id}`,
        topic: "Tactics" as const,
        prompt: `${board.turn() === "w" ? "White" : "Black"} to move. Which move is checkmate?`,
        choices: [answerText(correct.san), ...wrong.map((m) => answerText(m.san))],
        answer: answerText(correct.san),
        explanation: puzzle.explanation,
        fen: puzzle.fen,
        move: solution,
      },
    ];
  })
  .slice(0, 10);
export const quizQuestions: readonly QuizQuestion[] = [...concepts, ...mates];
export const quizTopics = [
  "All topics",
  "Rules",
  "Strategy",
  "Tactics",
  "Endgames",
] as const;
export function quizChoices(question: QuizQuestion) {
  const choices = [...question.choices];
  let seed =
    [...question.id].reduce(
      (s, c) => (Math.imul(s, 31) + c.charCodeAt(0)) | 0,
      17,
    ) >>> 0;
  for (let i = choices.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}
