import { START_FEN, type GameSession } from "./game";
import type { RatingLedger } from "./ratings";
import type { ReviewSummaryContext } from "./review";

/** Never assign the viewer's rating to an imported player or an older match. */
export function performanceContext(
  game: GameSession,
  ledger?: RatingLedger,
): ReviewSummaryContext {
  const index =
    ledger?.history.findIndex((entry) => entry.gameId === game.id) ?? -1;
  const entry = index >= 0 ? ledger!.history[index] : undefined;
  const ratings = entry
    ? {
        [entry.playerColor]: entry.before,
        [entry.playerColor === "w" ? "b" : "w"]: entry.opponentRating,
      }
    : { w: game.whiteElo, b: game.blackElo };
  return {
    ratings,
    priorGames: entry ? index : 0,
    result: game.result,
    eligible:
      game.startFen === START_FEN &&
      !!game.result &&
      !/time expired/i.test(game.result.reason) &&
      !game.rating?.assistance.length &&
      (!game.rating || game.rating.engine === "stockfish"),
  };
}
