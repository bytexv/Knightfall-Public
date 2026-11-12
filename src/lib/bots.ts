import type { EngineOptions } from "./engine";

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  readonly rating: string;
  /** A practice estimate, not a calibrated human rating. */
  readonly elo: number;
  readonly skill: number;
  readonly time: number;
  readonly color: string;
  readonly focus: string;
  readonly description: string;
}

// Preserve the original six IDs and ratings so saved games and rating ledgers survive updates.
export const bots: readonly BotProfile[] = [
  {
    id: "pebble",
    name: "Pebble",
    rating: "Beginner",
    elo: 100,
    skill: 0,
    time: 100,
    color: "#dce5cb",
    focus: "First moves",
    description:
      "Still finding its feet. A gentle place to try moving every piece.",
  },
  {
    id: "pip",
    name: "Pip",
    rating: "Beginner",
    elo: 200,
    skill: 0,
    time: 125,
    color: "#dce5cb",
    focus: "Free pieces",
    description:
      "Gets distracted easily. Look for the pieces it leaves behind.",
  },
  {
    id: "puddle",
    name: "Puddle",
    rating: "Beginner",
    elo: 300,
    skill: 0,
    time: 150,
    color: "#dce5cb",
    focus: "Safe squares",
    description:
      "A cheerful beginner. Practice checking whether your next square is safe.",
  },
  {
    id: "sprout",
    name: "Sprout",
    rating: "Beginner",
    elo: 400,
    skill: 0,
    time: 160,
    color: "#dce5cb",
    focus: "The basics",
    description:
      "A friendly first opponent. Finds simple moves and leaves you room to learn.",
  },
  {
    id: "clover",
    name: "Clover",
    rating: "Beginner",
    elo: 500,
    skill: 0,
    time: 200,
    color: "#dce5cb",
    focus: "Develop pieces",
    description:
      "A little more alert. Get your knights and bishops into the game.",
  },
  {
    id: "robin",
    name: "Robin",
    rating: "Beginner",
    elo: 600,
    skill: 1,
    time: 225,
    color: "#dce5cb",
    focus: "Simple threats",
    description:
      "Likes a check when it sees one. Keep your king out of trouble.",
  },
  {
    id: "milo",
    name: "Milo",
    rating: "Casual",
    elo: 700,
    skill: 2,
    time: 250,
    color: "#ead9bd",
    focus: "Board awareness",
    description:
      "An enthusiastic regular. Keep an eye on the whole board, not just your last move.",
  },
  {
    id: "scout",
    name: "Scout",
    rating: "Casual",
    elo: 800,
    skill: 3,
    time: 250,
    color: "#ead9bd",
    focus: "Loose pieces",
    description:
      "Curious and a little tricky. Watch your pieces and take your chances.",
  },
  {
    id: "dash",
    name: "Dash",
    rating: "Casual",
    elo: 900,
    skill: 4,
    time: 300,
    color: "#ead9bd",
    focus: "Quick tactics",
    description:
      "Always looking for a check. Meet its energy with careful, forcing moves.",
  },
  {
    id: "ember",
    name: "Ember",
    rating: "Casual",
    elo: 1000,
    skill: 5,
    time: 325,
    color: "#ead9bd",
    focus: "Counterattacks",
    description:
      "A lively sparring partner. Learn when to defend and when to hit back.",
  },
  {
    id: "hazel",
    name: "Hazel",
    rating: "Casual",
    elo: 1100,
    skill: 6,
    time: 350,
    color: "#ead9bd",
    focus: "Patient plans",
    description:
      "Prefers getting settled before making noise. Improve your least active piece.",
  },
  {
    id: "sage",
    name: "Sage",
    rating: "Club",
    elo: 1200,
    skill: 7,
    time: 400,
    color: "#ead9bd",
    focus: "Club foundations",
    description:
      "Patient development and tactical ideas. A thoughtful training partner.",
  },
  {
    id: "finch",
    name: "Finch",
    rating: "Club",
    elo: 1300,
    skill: 8,
    time: 400,
    color: "#c9dadd",
    focus: "Tactical awareness",
    description:
      "A step beyond the basics. Check for forks and pins before committing.",
  },
  {
    id: "brook",
    name: "Brook",
    rating: "Club",
    elo: 1400,
    skill: 20,
    time: 450,
    color: "#c9dadd",
    focus: "Solid positions",
    description:
      "A steady club challenge. Build a sound position before looking for a breakthrough.",
  },
  {
    id: "flint",
    name: "Flint",
    rating: "Club",
    elo: 1500,
    skill: 20,
    time: 510,
    color: "#c9dadd",
    focus: "Calculation",
    description:
      "Time to look a move further. Test your candidate moves before choosing one.",
  },
  {
    id: "rook",
    name: "Rook",
    rating: "Advanced",
    elo: 1600,
    skill: 20,
    time: 650,
    color: "#c9dadd",
    focus: "Active pieces",
    description: "Strong calculation, few free pieces. Bring your best plan.",
  },
  {
    id: "iris",
    name: "Iris",
    rating: "Club",
    elo: 1700,
    skill: 20,
    time: 630,
    color: "#c9dadd",
    focus: "Piece coordination",
    description:
      "Get your pieces working together. One good piece rarely wins alone.",
  },
  {
    id: "onyx",
    name: "Onyx",
    rating: "Club",
    elo: 1800,
    skill: 20,
    time: 690,
    color: "#c9dadd",
    focus: "Defensive resources",
    description:
      "A demanding sparring partner. Look for your opponent\u2019s best reply, too.",
  },
  {
    id: "blaze",
    name: "Blaze",
    rating: "Expert",
    elo: 1900,
    skill: 20,
    time: 750,
    color: "#d7cde0",
    focus: "Attack and defense",
    description:
      "A serious tactical workout. Make sure an attack has more than a good first move.",
  },
  {
    id: "nova",
    name: "Nova",
    rating: "Expert",
    elo: 2000,
    skill: 20,
    time: 950,
    color: "#d7cde0",
    focus: "Precise play",
    description:
      "Sharp tactics and precise endgames. A serious local challenge.",
  },
  {
    id: "atlas",
    name: "Atlas",
    rating: "Expert",
    elo: 2100,
    skill: 20,
    time: 870,
    color: "#d7cde0",
    focus: "Longer plans",
    description:
      "Ready for a longer struggle? Keep improving your position when tactics run out.",
  },
  {
    id: "vega",
    name: "Vega",
    rating: "Expert",
    elo: 2200,
    skill: 20,
    time: 930,
    color: "#d7cde0",
    focus: "Forcing lines",
    description:
      "Small oversights matter here. Calculate checks, captures and threats carefully.",
  },
  {
    id: "orion",
    name: "Orion",
    rating: "Expert",
    elo: 2300,
    skill: 20,
    time: 990,
    color: "#d7cde0",
    focus: "Endgame technique",
    description:
      "Turn a tiny advantage into something lasting. Every tempo can count.",
  },
  {
    id: "titan",
    name: "Titan",
    rating: "Expert",
    elo: 2400,
    skill: 20,
    time: 1050,
    color: "#d7cde0",
    focus: "Deep calculation",
    description:
      "A formidable opponent. Bring a clear plan and check the details twice.",
  },
  {
    id: "comet",
    name: "Comet",
    rating: "Master",
    elo: 2500,
    skill: 20,
    time: 1110,
    color: "#dfcbb8",
    focus: "High-level tactics",
    description:
      "A tough test for ambitious players. Make every forcing move earn its place.",
  },
  {
    id: "astra",
    name: "Astra",
    rating: "Master",
    elo: 2600,
    skill: 20,
    time: 1170,
    color: "#dfcbb8",
    focus: "Positional precision",
    description:
      "A demanding test of your decisions. Keep your pieces active and your king secure.",
  },
  {
    id: "zenith",
    name: "Zenith",
    rating: "Master",
    elo: 2700,
    skill: 20,
    time: 1230,
    color: "#dfcbb8",
    focus: "Elite practice",
    description:
      "Very little room for casual moves. Use it to test your strongest ideas.",
  },
  {
    id: "eclipse",
    name: "Eclipse",
    rating: "Master",
    elo: 2800,
    skill: 20,
    time: 1290,
    color: "#dfcbb8",
    focus: "Hard defense",
    description:
      "An uphill challenge. Practice finding resources in uncomfortable positions.",
  },
  {
    id: "nemesis",
    name: "Nemesis",
    rating: "Master",
    elo: 2900,
    skill: 20,
    time: 1350,
    color: "#dfcbb8",
    focus: "Ultimate challenge",
    description:
      "One last step before maximum strength. See how long your best preparation holds.",
  },
  {
    id: "stockfish",
    name: "Stockfish",
    rating: "Maximum",
    elo: 3000,
    skill: 20,
    time: 1500,
    color: "#dfcbb8",
    focus: "Maximum strength",
    description:
      "The strongest setting available on your device. No cloud connection needed.",
  },
];

export const defaultBot = bots.find((bot) => bot.id === "scout")!;
export function customElo(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(100, Math.min(3000, Math.round(value / 50) * 50))
    : 1200;
}
export function resolveBot(id: string, elo?: number): BotProfile {
  if (id !== "adaptive") return bots.find((bot) => bot.id === id) || defaultBot;
  const target = customElo(elo),
    nearest = recommendedBot(target);
  return {
    ...nearest,
    id: "adaptive",
    name: "Dial",
    elo: target,
    rating: "Adjustable",
    focus: "Your chosen challenge",
    description: "Set the strength before the game. Same board, your pace.",
  };
}
export const botBands = [
  { id: "beginner", label: "First steps", min: 100, max: 600 },
  { id: "casual", label: "Casual", min: 700, max: 1200 },
  { id: "club", label: "Club", min: 1300, max: 1800 },
  { id: "expert", label: "Expert", min: 1900, max: 2400 },
  { id: "master", label: "Master", min: 2500, max: 3000 },
] as const;
export function botBand(bot: BotProfile) {
  return botBands.find((band) => bot.elo >= band.min && bot.elo <= band.max)!
    .id;
}
export function recommendedBot(rating: number) {
  const target = Number.isFinite(rating) ? rating : defaultBot.elo;
  return bots.reduce((best, bot) =>
    Math.abs(bot.elo - target) < Math.abs(best.elo - target) ? bot : best,
  );
}
export function matchingBots(band: string, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  // Searching spans the whole roster so a name is never hidden by the level selector.
  return bots.filter((bot) =>
    terms.length
      ? terms.every((term) =>
          `${bot.name} ${bot.elo} ${bot.rating} ${bot.focus}`
            .toLocaleLowerCase()
            .includes(term),
        )
      : band === "all" || botBand(bot) === band,
  );
}
/** Stockfish supports UCI_Elo from 1320. Lower opponents use skill plus a legal-move learning policy. */
export function botSearchOptions(
  bot: BotProfile,
  maximumTime = 1500,
): EngineOptions {
  return {
    movetime: bot.id === "stockfish" ? maximumTime : bot.time,
    skill: bot.skill,
    depth: bot.id === "stockfish" ? 30 : bot.elo >= 1800 ? 26 : 20,
    ...(bot.elo >= 1400 && bot.id !== "stockfish" ? { elo: bot.elo } : {}),
  };
}
