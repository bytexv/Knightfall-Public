import type { GameSession } from "./game";
export const botVoices: Record<
  string,
  { tag: string; capture: string; check: string; win: string; lose: string }
> = Object.fromEntries(
  [
    ["pebble", "Small steps. Big board.", "A tiny treasure!"],
    ["pip", "One move at a time, pal.", "Mine? Oh, it is mine!"],
    [
      "puddle",
      "Making a splash on the chessboard.",
      "Splash! A piece in the pond.",
    ],
    ["sprout", "Let’s grow a good game.", "A little room to grow."],
    ["clover", "Luck likes an active knight.", "Four leaves, one capture."],
    ["robin", "A little bird saw that move.", "Something shiny for the nest."],
    ["milo", "Pull up a chair. Let’s play.", "I’ll take that, thanks."],
    [
      "scout",
      "There’s always something to discover.",
      "Found something on my travels.",
    ],
    ["dash", "Quick feet. Careful moves.", "In and out."],
    ["ember", "Keep the fire on the board.", "A little spark."],
    ["hazel", "Good plans take their time.", "That exchange suits me."],
    ["sage", "Every move leaves a lesson.", "One piece changes the picture."],
    ["finch", "Small threats have wings.", "A quick swoop."],
    ["brook", "Find a path through the position.", "The current has shifted."],
    ["flint", "Make every move count.", "A clean strike."],
    ["rook", "Straight lines. Clear intentions.", "Another file opening up."],
    ["iris", "Look twice. There’s more here.", "A different picture now."],
    ["onyx", "Quiet moves can be loud.", "One less distraction."],
    ["blaze", "Bring your fighting chess.", "Fuel for the attack."],
    ["nova", "Let’s light up this board.", "A little burst of energy."],
    ["atlas", "Build a position that holds.", "A shift in the balance."],
    ["vega", "Find your own constellation.", "One star off the board."],
    ["orion", "Every square is a destination.", "A new route appears."],
    ["titan", "Stand your ground.", "The balance moves."],
    ["comet", "Leave a trail of good moves.", "Passing through."],
    ["astra", "Keep looking beyond the obvious.", "The horizon has changed."],
    ["zenith", "One position. Your best move.", "A precise exchange."],
    ["eclipse", "Even shadows have a purpose.", "A square falls quiet."],
    ["nemesis", "Give me your toughest game.", "A small concession."],
    [
      "stockfish",
      "Calculation begins at the board.",
      "Material update registered.",
    ],
    [
      "adaptive",
      "Turn the dial. Find your level.",
      "A change in the position.",
    ],
  ].map(([id, tag, capture]) => [
    id,
    {
      tag,
      capture,
      check: `${tag} Check!`,
      win: `${tag} Good game — rematch?`,
      lose: `${tag} Well played. That one is yours.`,
    },
  ]),
);

/** Only facts visible on the board: dialogue never leaks engine analysis. */
export function botDialogue(game: GameSession) {
  const voice = botVoices[game.botId] || botVoices.adaptive,
    last = game.moves.at(-1);
  if (game.result)
    return game.result.winner === null
      ? `A draw. ${voice.tag}`
      : game.result.winner === game.playerColor
        ? voice.lose
        : voice.win;
  if (!last) return voice.tag;
  if (last.color === game.playerColor)
    return `${voice.tag} My turn — let me think.`;
  if (last.color !== game.playerColor) {
    if (last.san.includes("+")) return voice.check;
    if (last.captured) return voice.capture;
    if (last.san.startsWith("O-O")) return `King tucked away. ${voice.tag}`;
  }
  const rounds = [
    "Your move.",
    "I’m enjoying this one.",
    "Let’s see where this goes.",
    "Still plenty of chess to play.",
  ];
  return `${voice.tag} ${rounds[Math.floor(game.moves.length / 6) % rounds.length]}`;
}
