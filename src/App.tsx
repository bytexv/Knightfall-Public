import { version as appVersion } from "../package.json";
import { AlienAudio } from "./components/AlienAudio";
import { playedAlienGambit } from "./lib/alien-gambit";
import { Chess, type Color } from "chess.js";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ChevronLeft,
  Pause,
  TrendingUp,
  CircleHelp,
  Clock3,
  Copy,
  Cpu,
  Download,
  Flag,
  FolderHeart,
  GraduationCap,
  Handshake,
  Heart,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Menu,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AnalysisPanel from "./components/AnalysisPanel";
import BoardEditor from "./components/BoardEditor";
import ChessBoard from "./components/ChessBoard";
import { ImportDialog, Modal } from "./components/Dialogs";
import EndgameSchool from "./components/EndgameSchool";
import { GameActions, MoveList, NewGamePanel } from "./components/GameControls";
import GameNotes from "./components/GameNotes";
import LearnHub from "./components/LearnHub";
import NetworkPanel from "./components/NetworkPanel";
import PuzzleRush from "./components/PuzzleRush";
import RatingCard from "./components/RatingCard";
import UpdateCard, { UpdateIndicator } from "./components/UpdateCard";
import {
  explorePosition,
  explorationFen,
  playExplorationMove,
  type Exploration,
} from "./lib/exploration";
import {
  beginRatedGame,
  markRatingAssisted,
  markRatingEngine,
  mergeRatingLedgers,
  recordRatedResult,
  sanitizeRatingLedger,
  type RatingLedger,
} from "./lib/ratings";
import { type MoveReview } from "./lib/review";
import { type EndgameDrill } from "./data/endgames";
import { type Gambit } from "./data/gambits";
import { puzzles } from "./data/puzzles";
import { chooseBotMove, seededBotRandom } from "./lib/bot-policy";
import { advanceClock, isTimedLocal } from "./lib/clock";
import { LocalEngine } from "./lib/engine";
import {
  applyMove,
  bots,
  capturedPieces,
  formatClock,
  importFen,
  importPgn,
  newSession,
  restoreChess,
  sessionPgn,
  undoMoves,
  type GameSession,
} from "./lib/game";
import { type LanClient, type LanSnapshot } from "./lib/lan";
import {
  downloadFile,
  playSound,
  readStore,
  sanitizeSettings,
  sanitizeSolved,
  savedGames,
  saveGame,
  validateSavedGame,
  writeStore,
  type Settings,
} from "./lib/storage";
type Page =
  | "play"
  | "analysis"
  | "puzzles"
  | "openings"
  | "games"
  | "multiplayer"
  | "settings"
  | "endgames"
  | "challenge";
const pages = [
  { id: "play", label: "Play chess", icon: Play },
  { id: "analysis", label: "Analysis", icon: Activity },
  { id: "puzzles", label: "Puzzles", icon: Puzzle },
  { id: "challenge", label: "Tactics Sprint", icon: Target },
  { id: "openings", label: "Learn chess", icon: BookOpen },
  { id: "endgames", label: "Endgame school", icon: GraduationCap },
  { id: "games", label: "My games", icon: FolderHeart },
  { id: "multiplayer", label: "Play with friends", icon: Wifi },
] as const;
const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  challenge: {
    title: "Tactics Sprint",
    subtitle: "Three lives. Calculate the full line. Beat your own score.",
  },
  endgames: {
    title: "Endgame practice",
    subtitle: "Win the won positions. Hold the drawn ones.",
  },
  play: {
    title: "Your board",
    subtitle: "Pick an opponent, set the clock, and play.",
  },
  analysis: {
    title: "Analysis board",
    subtitle: "Check the critical move. Try another line.",
  },
  puzzles: {
    title: "Tactics",
    subtitle:
      "Look for checks, captures, and threats. Finish the whole sequence.",
  },
  openings: {
    title: "Learn & practice",
    subtitle:
      "Learn the basics, practice useful habits, and explore famous openings.",
  },
  games: {
    title: "Your games",
    subtitle: "Resume a game, replay it, or find the move you missed.",
  },
  multiplayer: {
    title: "Play with friends",
    subtitle: "One Wi-Fi network. Two players. No account needed.",
  },
  settings: {
    title: "Your setup",
    subtitle: "Your name, your board, your preferences.",
  },
};
const glyphs: Record<string, string> = {
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
};
function loadCurrent() {
  try {
    const g = validateSavedGame(readStore<unknown>("current", null));
    if (g && g.mode !== "lan" && g.mode !== "puzzle") {
      restoreChess(g);
      return {
        ...g,
        started: g.started && g.mode === "analysis" ? true : false,
      };
    }
  } catch {
    /* Ignore an invalid previous session. */
  }
  return newSession();
}
export default function App() {
  const [game, setGameState] = useState<GameSession>(loadCurrent);
  const [page, setPage] = useState<Page>(() =>
    ["analysis", "gambit"].includes(game.mode) ? "analysis" : "play",
  );
  const gameRef = useRef(game);
  // Clocks and workers can settle before React commits a render. Keep their
  // authoritative snapshot synchronized with every state transition.
  const setGame = useCallback(
    (action: GameSession | ((current: GameSession) => GameSession)) => {
      const next =
        typeof action === "function" ? action(gameRef.current) : action;
      gameRef.current = next;
      setGameState(next);
      recordGameRating(next);
    },
    [],
  );
  const clockAnchor = useRef(performance.now());
  const [orientation, setOrientation] = useState<Color>(game.playerColor);
  const [historyIndex, setHistoryIndex] = useState(game.moves.length - 1);
  const [showSetup, setShowSetup] = useState(
    !game.started && game.moves.length === 0,
  );
  const [settings, setSettings] = useState<Settings>(() =>
    sanitizeSettings(readStore<unknown>("settings", {})),
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modal, setModal] = useState<
    | "import"
    | "new"
    | "resign"
    | "draw"
    | "help"
    | "install"
    | "leave"
    | "editor"
    | "practice"
    | null
  >(null);
  const [thinking, setThinking] = useState(false);
  const [engineName, setEngineName] = useState("Local engine");
  const botEngine = useRef<LocalEngine | null>(null);
  const hintEngine = useRef<LocalEngine | null>(null);
  const hintToken = useRef(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [arrows, setArrows] = useState<{ from: string; to: string }[]>([]);
  const [evaluation, setEvaluation] = useState(0);
  const [ratings, setRatings] = useState<RatingLedger>(() =>
    sanitizeRatingLedger(readStore("ratings", null)),
  );
  const ratingsRef = useRef(ratings);
  const [exploration, setExploration] = useState<Exploration | null>(null);
  const [activeReview, setActiveReview] = useState<MoveReview | null>(null);
  const explorationRef = useRef(exploration);
  explorationRef.current = exploration;
  const pageRef = useRef(page);
  pageRef.current = page;
  const mainRef = useRef<HTMLElement | null>(null);
  const [archive, setArchive] = useState<GameSession[]>(savedGames);
  const [gameSearch, setGameSearch] = useState("");
  const [selectedGambit, setSelectedGambit] = useState<Gambit | null>(null);
  const [selectedDrill, setSelectedDrill] = useState<EndgameDrill | null>(null);
  const [gambitPractice, setGambitPractice] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [puzzlePly, setPuzzlePly] = useState(0);
  const [puzzleStatus, setPuzzleStatus] = useState<
    "playing" | "wrong" | "solved" | "revealed"
  >("playing");
  const [puzzleFilter, setPuzzleFilter] = useState("All themes");
  const [solved, setSolved] = useState<string[]>(() =>
    sanitizeSolved(readStore<unknown>("solved", [])),
  );
  const [puzzleAttempts, setPuzzleAttempts] = useState(0);
  const [lanSnapshot, setLanSnapshot] = useState<LanSnapshot | null>(null);
  const lanRef = useRef<LanClient | null>(null);
  const [lanConnection, setLanConnection] = useState("connected");
  const lanUnsubscribe = useRef<(() => void)[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const timeoutEpoch = useRef(0);
  const pendingAction = useRef<(() => void) | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const [nameDraft, setNameDraft] = useState(settings.name);
  const [nameError, setNameError] = useState("");
  useEffect(() => {
    setNameDraft(settings.name);
    setNameError("");
  }, [settings.name, page]);
  const puzzle = puzzles[puzzleIndex];
  const boardPage = ["play", "analysis", "puzzles"].includes(page);
  const isLan = game.mode === "lan" && !!lanSnapshot;
  const mainPosition =
    historyIndex < 0
      ? game.startFen
      : game.moves[historyIndex]?.fen || game.fen;
  const preview =
    exploration?.sourceId === game.id && page === "analysis"
      ? exploration
      : null;
  const position = preview ? explorationFen(preview) : mainPosition;
  const chess = new Chess(position);
  const atLatest = historyIndex === game.moves.length - 1;
  const currentBot = bots.find((b) => b.id === game.botId) || bots[1];
  const ratingEntry = ratings.history.find((entry) => entry.gameId === game.id);
  const ratingEligible =
    !!game.rating &&
    game.rating.assistance.length === 0 &&
    game.rating.engine !== "fallback";
  function commitRatings(next: RatingLedger) {
    ratingsRef.current = next;
    setRatings(next);
    if (!writeStore("ratings", next))
      notify(
        "Your rating changed, but device storage is full. Export a backup before closing.",
      );
  }
  function selectReviewMove(index: number) {
    setExploration(null);
    setArrows([]);
    setHistoryIndex(index);
  }
  function previewLine(anchor: number, moves: string[]) {
    setArrows([]);
    setExploration(explorePosition(gameRef.current, anchor, moves, "line"));
  }
  function retryReviewMove(index: number) {
    const expected =
      activeReview?.index === index ? activeReview.best : undefined;
    setArrows([]);
    setExploration(
      explorePosition(gameRef.current, index - 1, [], "retry", expected),
    );
  }
  function recordGameRating(completed: GameSession) {
    if (!completed.result || completed.mode !== "bot" || !completed.rating)
      return;
    const result = recordRatedResult(ratingsRef.current, completed);
    if (result.entry) {
      commitRatings(result.ledger);
      notify(
        `Local Elo ${result.entry.after} (${result.entry.delta >= 0 ? "+" : ""}${result.entry.delta}). Game recorded.`,
      );
    }
  }
  useEffect(() => {
    recordGameRating(game);
  }, [game.id, game.result, game.rating]);
  useEffect(() => {
    if (!preview?.playing) return;
    const timer = setTimeout(
      () =>
        setExploration((current) => {
          if (
            !current ||
            !current.playing ||
            current.sourceId !== game.id ||
            current.line !== preview.line
          )
            return current;
          const index = Math.min(
            current.line.moves.length - 1,
            current.index + 1,
          );
          return {
            ...current,
            index,
            playing: index < current.line.moves.length - 1,
          };
        }),
      680,
    );
    return () => clearTimeout(timer);
  }, [preview?.index, preview?.playing, preview?.line, game.id]);
  useEffect(() => {
    setExploration(null);
    setActiveReview(null);
    window.scrollTo({ top: 0, behavior: "auto" });
    const label = pageTitles[page].title;
    document.title = `${label} · Knightfall`;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animation =
      !reduced &&
      mainRef.current?.animate?.(
        [
          { opacity: 0.55, transform: "translateY(7px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 210, easing: "cubic-bezier(.2,.7,.2,1)" },
      );
    return () => {
      if (animation) animation.cancel();
    };
  }, [page]);
  useEffect(() => {
    const install = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      timeoutEpoch.current++;
      hintToken.current++;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      lanUnsubscribe.current.forEach((fn) => fn());
      lanRef.current?.disconnect();

      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  useEffect(() => {
    const bot = new LocalEngine({
      mode: settings.engineMode,
      threads: settings.engineThreads,
      onStatus: (_status, name) => setEngineName(name),
    });
    const hint = new LocalEngine({
      mode: settings.engineMode,
      threads: settings.engineThreads,
    });
    botEngine.current = bot;
    hintEngine.current = hint;
    setEngineName(bot.engineName);
    return () => {
      bot.destroy();
      hint.destroy();
    };
  }, [settings.engineMode, settings.engineThreads]);
  useEffect(() => {
    writeStore("settings", settings);
  }, [settings]);
  useEffect(() => {
    if (
      game.mode !== "puzzle" &&
      game.mode !== "gambit" &&
      game.mode !== "analysis"
    ) {
      saveGame(game);
      setArchive(savedGames());
    }
    if (game.mode !== "lan" && game.mode !== "puzzle")
      writeStore("current", game);
  }, [game.moves, game.result, game.started, game.id, game.mode, game.rating]);
  useEffect(() => {
    const save = () => {
      if (!["lan", "puzzle"].includes(gameRef.current.mode)) {
        writeStore("current", gameRef.current);
        saveGame(gameRef.current);
      }
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);
  useEffect(() => {
    clockAnchor.current = performance.now();
    if (!isTimedLocal(game)) return;
    const timer = setInterval(() => {
      settleClock();
    }, 100);
    return () => clearInterval(timer);
  }, [game.started, game.result, game.id, game.time.base, game.mode]);
  useEffect(() => {
    hintToken.current++;
    hintEngine.current?.cancel();
    setHintBusy(false);
    if (!(preview && preview.line.moves.length === 0 && preview.index === -1))
      setArrows([]);
  }, [position]);
  useEffect(() => {
    if (
      game.mode !== "bot" ||
      !game.started ||
      game.result ||
      new Chess(game.fen).turn() === game.playerColor ||
      !botEngine.current
    ) {
      setThinking(false);
      return;
    }
    let active = true;
    const fen = game.fen;
    setThinking(true);
    const bot = bots.find((b) => b.id === game.botId) || bots[1];
    const timer = setTimeout(() => {
      void botEngine.current
        ?.analyze(fen, {
          movetime: bot.id === "stockfish" ? settings.botTime : bot.time,
          skill: bot.skill,
          depth: bot.id === "stockfish" ? 30 : 20,
        })
        .then((r) => {
          if (
            !active ||
            !r.bestMove ||
            !gameRef.current.started ||
            gameRef.current.mode !== "bot" ||
            gameRef.current.fen !== fen ||
            gameRef.current.result
          )
            return;
          const choice = chooseBotMove(
            fen,
            bot.id,
            r,
            seededBotRandom(
              [...(gameRef.current.id + fen)].reduce(
                (seed, char) => (Math.imul(seed, 31) + char.charCodeAt(0)) | 0,
                0,
              ),
            ),
          );
          if (!choice) {
            setThinking(false);
            return;
          }
          const next = applyMove(
            markRatingEngine(
              settleClock(),
              /stockfish/i.test(r.engine) && !/fallback/i.test(r.engine)
                ? "stockfish"
                : "fallback",
            ),
            choice.slice(0, 2),
            choice.slice(2, 4),
            choice[4],
          );
          if (next) {
            setGame(next);
            setHistoryIndex(next.moves.length - 1);
            if (settings.sound)
              playSound(
                next.result
                  ? "end"
                  : next.moves.at(-1)?.captured
                    ? "capture"
                    : "move",
              );
          }
          setThinking(false);
        })
        .catch((e) => {
          if (active && e.name !== "AbortError") {
            setThinking(false);
            notify(
              "The bot could not find a move. Start a new game or try again.",
            );
          }
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      botEngine.current?.cancel();
    };
  }, [
    game.fen,
    game.mode,
    game.started,
    game.result,
    game.playerColor,
    game.botId,
    game.id,
    settings.sound,
    settings.engineMode,
    settings.engineThreads,
    settings.botTime,
    notify,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        document.querySelector('[aria-modal="true"]') ||
        modal ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (
        e.key === "ArrowLeft" &&
        !(e.target as HTMLElement).closest(".chessboard")
      ) {
        e.preventDefault();
        if (explorationRef.current && pageRef.current === "analysis")
          setExploration((current) =>
            current
              ? {
                  ...current,
                  index: Math.max(-1, current.index - 1),
                  playing: false,
                }
              : null,
          );
        else setHistoryIndex((i) => Math.max(-1, i - 1));
      }
      if (
        e.key === "ArrowRight" &&
        !(e.target as HTMLElement).closest(".chessboard")
      ) {
        e.preventDefault();
        if (explorationRef.current && pageRef.current === "analysis")
          setExploration((current) =>
            current
              ? {
                  ...current,
                  index: Math.min(
                    current.line.moves.length - 1,
                    current.index + 1,
                  ),
                  playing: false,
                }
              : null,
          );
        else
          setHistoryIndex((i) =>
            Math.min(gameRef.current.moves.length - 1, i + 1),
          );
      }
      if (e.key === "Escape") setMobileNav(false);
      if (e.key.toLowerCase() === "f")
        setOrientation((o) => (o === "w" ? "b" : "w"));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);
  function settleClock() {
    const now = performance.now();
    const next = advanceClock(
      gameRef.current,
      Math.max(0, now - clockAnchor.current),
    );
    clockAnchor.current = now;
    if (next !== gameRef.current) {
      gameRef.current = next;
      setGame(next);
    }
    return next;
  }
  function leaveLan() {
    const leaving = gameRef.current;
    if (leaving.mode === "lan" && leaving.started && !leaving.result) {
      const ended = {
        ...leaving,
        result: {
          winner: leaving.playerColor === "w" ? ("b" as Color) : ("w" as Color),
          reason: "Left game",
        },
      };
      gameRef.current = ended;
      saveGame(ended);
    }
    lanUnsubscribe.current.forEach((fn) => fn());
    lanUnsubscribe.current = [];
    lanRef.current?.leave();
    lanRef.current?.disconnect();
    lanRef.current = null;
    setLanSnapshot(null);
  }
  function replaceGame(next: GameSession, index = next.moves.length - 1) {
    clockAnchor.current = performance.now();
    gameRef.current = next;
    timeoutEpoch.current++;
    botEngine.current?.cancel();
    hintEngine.current?.cancel();
    setThinking(false);
    setGame(next);
    setHistoryIndex(index);
    setOrientation(next.playerColor);
    setExploration(null);
    setActiveReview(null);
    setArrows([]);
    setSelectedGambit(null);
    setSelectedDrill(null);
    setGambitPractice(false);
  }
  function confirmLeave(action: () => void) {
    if (
      gameRef.current.mode === "lan" &&
      gameRef.current.started &&
      !gameRef.current.result
    ) {
      pendingAction.current = action;
      setModal("leave");
      return true;
    }
    return false;
  }
  function resumeGame(saved: GameSession, confirmed = false) {
    if (!confirmed && confirmLeave(() => resumeGame(saved, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    replaceGame({ ...saved, started: true });
    setShowSetup(false);
    setPage("play");
  }
  function startDrill(drill: EndgameDrill, confirmed = false) {
    if (!confirmed && confirmLeave(() => startDrill(drill, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    replaceGame(
      newSession({
        mode: "bot",
        startFen: drill.fen,
        fen: drill.fen,
        playerColor: drill.playerColor,
        botId: "stockfish",
        time: { base: 0, increment: 0 },
        started: true,
        title: `Endgame · ${drill.title}`,
      }),
    );
    setSelectedDrill(drill);
    setShowSetup(false);
    setPage("play");
    setModal(null);
  }
  function startGame(
    options: {
      mode: "bot" | "local";
      botId: string;
      color: "w" | "b" | "random";
      time: { base: number; increment: number };
      startFen?: string;
    },
    confirmed = false,
  ) {
    if (!confirmed && confirmLeave(() => startGame(options, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    const playerColor =
      options.color === "random"
        ? Math.random() < 0.5
          ? "w"
          : "b"
        : options.color;
    const fresh = newSession({
      mode: options.mode,
      startFen: options.startFen,
      playerColor,
      botId: options.botId,
      whiteName:
        options.mode === "bot"
          ? playerColor === "w"
            ? settings.name
            : bots.find((b) => b.id === options.botId)?.name
          : "White",
      blackName:
        options.mode === "bot"
          ? playerColor === "b"
            ? settings.name
            : bots.find((b) => b.id === options.botId)?.name
          : "Black",
      time: options.time,
      started: true,
      title:
        options.mode === "bot"
          ? `You vs ${bots.find((b) => b.id === options.botId)?.name}`
          : "Pass & play",
    });
    const enrolled =
      options.mode === "bot" && !options.startFen
        ? beginRatedGame(fresh, ratingsRef.current)
        : { game: fresh, ledger: ratingsRef.current };
    if (enrolled.game.rating) commitRatings(enrolled.ledger);
    replaceGame(enrolled.game);
    setShowSetup(false);
    setPage("play");
    setModal(null);
  }
  function navigate(next: Page, confirmed = false) {
    if (
      next === "challenge" &&
      !confirmed &&
      confirmLeave(() => navigate(next, true))
    )
      return;
    if (next === "challenge" && game.mode === "lan") {
      leaveLan();
      replaceGame(newSession());
      setShowSetup(true);
    }
    setMobileNav(false);
    if (
      next !== "play" &&
      ["bot", "local"].includes(game.mode) &&
      game.started &&
      !game.result
    ) {
      const settled = settleClock();
      const paused = settled.result ? settled : { ...settled, started: false };
      gameRef.current = paused;
      setGame(paused);
      saveGame(paused);
    }
    if (
      next === "play" &&
      ["puzzle", "gambit", "analysis"].includes(game.mode)
    ) {
      replaceGame(newSession());
      setShowSetup(true);
      setPage("play");
    } else if (next === "puzzles" && game.mode !== "puzzle") {
      loadPuzzle(puzzleIndex);
    } else {
      setPage(next);
    }
    if (next === "games") setArchive(savedGames());
    if (next === "analysis") {
      setGame(markRatingAssisted(gameRef.current, "analysis"));
      setShowSetup(false);
      if (!["analysis", "gambit", "lan"].includes(gameRef.current.mode)) {
        const source = gameRef.current;
        saveGame(source);
        replaceGame({
          ...source,
          mode: "analysis",
          started: true,
          time: { base: 0, increment: 0 },
        });
      }
    }
  }
  function loadPuzzle(index: number, confirmed = false) {
    if (!confirmed && confirmLeave(() => loadPuzzle(index, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    const p = puzzles[index];
    if (!p) return;
    const turn = new Chess(p.fen).turn();
    replaceGame(
      newSession({
        mode: "puzzle",
        startFen: p.fen,
        fen: p.fen,
        playerColor: turn,
        started: true,
        time: { base: 0, increment: 0 },
        title: p.title,
      }),
    );
    setPuzzleIndex(index);
    setPuzzlePly(0);
    setPuzzleStatus("playing");
    setPuzzleAttempts(0);
    setShowSetup(false);
    setPage("puzzles");
  }
  function nextPuzzle() {
    const choices = puzzles
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) => puzzleFilter === "All themes" || p.theme === puzzleFilter,
      );
    const index = choices.findIndex((x) => x.i === puzzleIndex);
    loadPuzzle(choices[(index + 1) % choices.length]?.i ?? 0);
  }
  function markSolved() {
    setPuzzleStatus("solved");
    if (puzzleAttempts === 0) {
      setSolved((old) => {
        const next = old.includes(puzzle.id) ? old : [...old, puzzle.id];
        writeStore("solved", next);
        return next;
      });
    }
    if (settings.sound) playSound("end");
  }
  function makeMove(from: string, to: string, promotion = "q") {
    if (isLan) {
      if (
        lanSnapshot.status === "playing" &&
        lanSnapshot.yourColor === lanSnapshot.turn &&
        atLatest
      )
        lanRef.current?.move(from, to, promotion);
      return;
    }
    if (page === "analysis" && !gambitPractice) {
      const base = preview || explorePosition(gameRef.current, historyIndex);
      const next = playExplorationMove(base, from, to, promotion);
      if (next) {
        setExploration(next);
        setArrows([]);
        if (settings.sound)
          playSound(next.line.moves[next.index]?.captured ? "capture" : "move");
      }
      return;
    }
    const current = settleClock();
    if (page !== "analysis" && (current.result || !current.started)) return;
    if (!atLatest && page !== "analysis") return;
    if (current.mode === "puzzle" && page === "puzzles") {
      if (puzzleStatus === "solved" || puzzleStatus === "revealed") return;
      const expected = puzzle.solution[puzzlePly];
      const uci = from + to + (expected?.length === 5 ? promotion : "");
      let alternativeMate = false;
      try {
        const candidate = new Chess(current.fen);
        candidate.move({ from, to, promotion });
        alternativeMate = candidate.isCheckmate();
      } catch {
        /* The board normally prevents illegal moves. */
      }
      if (uci !== expected && !alternativeMate) {
        setPuzzleStatus("wrong");
        setPuzzleAttempts((n) => n + 1);
        notify("Not quite. Look for a stronger continuation.");
        return;
      }
      const next = applyMove(current, from, to, promotion);
      if (!next) return;
      setGame(next);
      setHistoryIndex(next.moves.length - 1);
      setPuzzleStatus("playing");
      setPuzzlePly((p) => p + 1);
      if (settings.sound)
        playSound(next.moves.at(-1)?.captured ? "capture" : "move");
      if (puzzlePly + 1 >= puzzle.solution.length || alternativeMate) {
        setPuzzlePly(puzzle.solution.length);
        markSolved();
        return;
      }
      const epoch = timeoutEpoch.current;
      setTimeout(() => {
        if (epoch !== timeoutEpoch.current) return;
        const reply = puzzle.solution[puzzlePly + 1];
        if (!reply) return;
        const response = applyMove(
          gameRef.current,
          reply.slice(0, 2),
          reply.slice(2, 4),
          reply[4],
        );
        if (response) {
          setGame(response);
          setHistoryIndex(response.moves.length - 1);
          setPuzzlePly(puzzlePly + 2);
          if (puzzlePly + 2 >= puzzle.solution.length) markSolved();
        }
      }, 450);
      return;
    }
    if (gambitPractice && selectedGambit) {
      const expected = new Chess(current.fen);
      const move = expected.move(selectedGambit.moves[current.moves.length]);
      if (move.from !== from || move.to !== to) {
        notify(
          `Try the opening idea again. Hint: ${selectedGambit.moves[practiceIndex]}`,
        );
        return;
      }
      setPracticeIndex(current.moves.length + 1);
      if (current.moves.length + 1 === selectedGambit.moves.length) {
        setGambitPractice(false);
        notify("Opening line complete. Well played!");
      }
    }
    const next = applyMove(current, from, to, promotion);
    if (next) {
      setGame(next);
      setHistoryIndex(next.moves.length - 1);
      if (settings.sound)
        playSound(
          next.result
            ? "end"
            : new Chess(next.fen).isCheck()
              ? "check"
              : next.moves.at(-1)?.captured
                ? "capture"
                : "move",
        );
    }
  }
  async function hint() {
    if (hintBusy) return;
    if (game.mode === "puzzle") {
      const move = puzzle.solution[puzzlePly];
      if (move) {
        setArrows([{ from: move.slice(0, 2), to: move.slice(2, 4) }]);
        setPuzzleAttempts((n) => n + 1);
        notify("Follow the arrow. This puzzle will count as assisted.");
      }
      return;
    }
    setGame(markRatingAssisted(gameRef.current, "hint"));
    const token = ++hintToken.current;
    setHintBusy(true);
    try {
      const r = await hintEngine.current?.analyze(position, {
        movetime: 700,
        depth: 16,
      });
      if (token !== hintToken.current) return;
      if (r?.bestMove) {
        setArrows([
          { from: r.bestMove.slice(0, 2), to: r.bestMove.slice(2, 4) },
        ]);
        notify("A promising move is highlighted on the board.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        notify("Hint unavailable. Try again.");
    } finally {
      if (token === hintToken.current) setHintBusy(false);
    }
  }
  function undo() {
    if (preview) {
      setExploration((current) =>
        current
          ? {
              ...current,
              index: Math.max(-1, current.index - 1),
              playing: false,
            }
          : null,
      );
      return;
    }
    if (page === "analysis" && !gambitPractice) {
      selectReviewMove(Math.max(-1, historyIndex - 1));
      return;
    }
    if (isLan) {
      notify("Takebacks are disabled for Wi-Fi games.");
      return;
    }
    botEngine.current?.cancel();
    const count =
      game.mode === "bot" && new Chess(game.fen).turn() === game.playerColor
        ? 2
        : 1;
    const next = undoMoves(
      markRatingAssisted(settleClock(), "takeback"),
      count,
    );
    if (gambitPractice) setPracticeIndex(next.moves.length);
    setGame(next);
    setHistoryIndex(next.moves.length - 1);
    notify("Move taken back. Clock time is not restored.");
  }
  function openGambit(g: Gambit, confirmed = false) {
    if (!confirmed && confirmLeave(() => openGambit(g, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    let next = newSession({
      mode: "gambit",
      started: true,
      time: { base: 0, increment: 0 },
      title: g.name,
    });
    for (const san of g.moves) {
      const c = new Chess(next.fen);
      const m = c.move(san);
      next = applyMove(next, m.from, m.to, m.promotion) || next;
    }
    replaceGame(next, -1);
    setSelectedGambit(g);
    setShowSetup(false);
    setPage("analysis");
  }
  const onLanGame = useCallback(
    (snapshot: LanSnapshot, client: LanClient) => {
      const first = lanRef.current !== client;
      const previous = gameRef.current;
      const id = `lan-${snapshot.gameId}`;
      const sameGame = previous.id === id;
      const changedColor = previous.playerColor !== snapshot.yourColor;
      if (first) {
        lanUnsubscribe.current.forEach((fn) => fn());
        if (lanRef.current) {
          if (lanRef.current.snapshot?.code !== snapshot.code) {
            if (previous.mode === "lan" && previous.started && !previous.result)
              saveGame({
                ...previous,
                result: {
                  winner: previous.playerColor === "w" ? "b" : "w",
                  reason: "Left game",
                },
              });
            lanRef.current.leave();
          }
          lanRef.current.disconnect();
        }
        lanRef.current = client;
        lanUnsubscribe.current = [
          client.on("error", notify),
          client.on("connection", setLanConnection),
        ];
        setLanConnection(client.connection);
        setPage("play");
        setShowSetup(false);
        setSelectedGambit(null);
        timeoutEpoch.current++;
        botEngine.current?.cancel();
      }
      setLanSnapshot(snapshot);
      if (first || !sameGame || changedColor)
        setOrientation(snapshot.yourColor || "w");
      let imported: GameSession;
      try {
        imported =
          sameGame &&
          previous.fen === snapshot.fen &&
          previous.moves.length === snapshot.history.length
            ? previous
            : importPgn(snapshot.pgn);
      } catch {
        imported = newSession({ startFen: snapshot.fen });
      }
      setGame({
        ...imported,
        id,
        createdAt: snapshot.createdAt,
        mode: "lan",
        fen: snapshot.fen,
        started: snapshot.status === "playing",
        result: snapshot.result,
        playerColor: snapshot.yourColor || "w",
        time: {
          base: snapshot.timeControl.baseSeconds,
          increment: snapshot.timeControl.incrementSeconds,
        },
        clocks: { w: snapshot.clocks.w, b: snapshot.clocks.b },
        title: `Wi-Fi room ${snapshot.code} · Game ${snapshot.round}`,
      });
      setHistoryIndex((index) =>
        !sameGame || index === previous.moves.length - 1
          ? snapshot.history.length - 1
          : index,
      );
    },
    [notify],
  );
  async function copy(text: string, message = "Copied to clipboard.") {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      /* Try the local-origin fallback below. */
    }
    if (!copied) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        /* No clipboard API available. */
      }
      field.remove();
    }
    notify(
      copied
        ? message
        : "Clipboard is unavailable here. Use export to save a file.",
    );
  }
  async function exportPgn(g = game) {
    try {
      const text =
        g.mode === "lan" && g.id === game.id && lanSnapshot
          ? lanSnapshot.pgn
          : sessionPgn(g);
      const saved = await downloadFile(
        `knightfall-${new Date(g.createdAt).toISOString().slice(0, 10)}.pgn`,
        text,
        "application/x-chess-pgn",
      );
      if (saved) notify("PGN export ready.");
    } catch {
      notify("This game could not be exported. Please try again.");
    }
  }
  function imported(next: GameSession, confirmed = false) {
    if (!confirmed && confirmLeave(() => imported(next, true))) return;
    leaveLan();
    saveGame(gameRef.current);
    next = markRatingAssisted(next, "analysis");
    if (next.rating && !next.result) {
      const saved = savedGames().find((item) => item.id === next.id);
      if (saved) saveGame({ ...saved, rating: next.rating });
    }
    replaceGame(next);
    setShowSetup(false);
    setPage("analysis");
    notify("Game loaded. Explore any move on the board.");
  }
  const topColor: Color = orientation === "w" ? "b" : "w",
    bottomColor: Color = orientation;
  const turn = new Chess(game.fen).turn();
  function playerName(color: Color) {
    if (isLan) return lanSnapshot.players[color]?.name || "Waiting for player…";
    if (game.mode === "bot")
      return color === game.playerColor ? settings.name : currentBot.name;
    if (game.mode === "puzzle")
      return color === game.playerColor ? "Your turn" : "Find the continuation";
    return (
      (color === "w" ? game.whiteName : game.blackName) ||
      (color === "w" ? "White" : "Black")
    );
  }
  function playerBar(color: Color, bottom = false) {
    const bot = game.mode === "bot" && color !== game.playerColor;
    const captures = capturedPieces(position, color === "w" ? "b" : "w");
    return (
      <div className={`player-bar ${bottom ? "bottom" : ""}`}>
        <div
          className={`player-avatar ${bot ? "bot" : ""}`}
          data-bot={bot ? currentBot.id : undefined}
        >
          {bot ? (
            currentBot.name.slice(0, 2).toUpperCase()
          ) : (
            <img src={`./pieces/${color}K.svg`} alt="" />
          )}
        </div>
        <div className="player-details">
          <strong>
            {playerName(color)}
            {color === game.playerColor && game.mode === "bot" && (
              <span className="you-tag">YOU</span>
            )}
            {isLan && (
              <span
                className={`status-dot ${lanSnapshot.players[color]?.connected ? "" : "offline"}`}
              />
            )}
          </strong>
          <small>
            {bot
              ? thinking
                ? "Thinking…"
                : `≈ ${currentBot.elo} Elo · ${currentBot.rating}`
              : game.mode === "puzzle"
                ? `${puzzle.rating} · ${puzzle.theme}`
                : isLan
                  ? lanConnection === "connected"
                    ? "Same Wi-Fi"
                    : "Reconnecting…"
                  : color === game.playerColor && game.mode === "bot"
                    ? `${ratings.rating} Local Elo${ratings.provisional ? " · provisional" : ""}`
                    : game.mode === "analysis"
                      ? "Analysis position"
                      : "Local player"}
          </small>
          {captures.length > 0 && (
            <span className="captured-pieces">
              {captures.map((p) => glyphs[p]).join("")}
            </span>
          )}
        </div>
        <div
          className={`clock ${turn === color && game.started && !game.result ? "active" : ""} ${game.clocks[color] < 30000 && game.time.base ? "low" : ""}`}
        >
          <Clock3 size={15} />
          {formatClock(game.clocks[color], game.time.base === 0)}
        </div>
      </div>
    );
  }
  const canMove =
    atLatest &&
    game.started &&
    !game.result &&
    (!isLan ||
      (lanSnapshot.status === "playing" &&
        lanSnapshot.turn === lanSnapshot.yourColor &&
        lanConnection === "connected")) &&
    (game.mode !== "bot" || turn === game.playerColor) &&
    (game.mode !== "puzzle" ||
      (turn === game.playerColor &&
        puzzleStatus !== "solved" &&
        puzzleStatus !== "revealed"));
  const boardEnabled = page === "analysis" ? !isLan && !thinking : canMove;
  const resultTitle =
    game.result?.winner === null
      ? "Draw"
      : game.result?.winner === game.playerColor && game.mode === "bot"
        ? "You won!"
        : `${game.result?.winner === "w" ? "White" : "Black"} wins`;
  return (
    <div className={`app-shell page-${page} ${focusMode ? "focus-mode" : ""}`}>
      <aside
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Chess navigation"
      >
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("play");
          }}
        >
          <img src="./icon.svg" alt="" />
          <span>
            Knightfall<small>CHESS CLUB</small>
          </span>
        </a>
        <div className="sidebar-caption">THE CLUBHOUSE</div>
        <nav>
          {pages.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              aria-label={item.label}
              title={item.label}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === "puzzles" && (
                <span className="nav-tag">{puzzles.length}</span>
              )}
              {item.id === "multiplayer" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <section className="sidebar-recent" aria-label="Recent games">
          <div className="sidebar-caption">YOUR SCORESHEETS</div>
          {archive.length ? (
            archive.slice(0, 2).map((recent) => (
              <button
                className="recent-game"
                key={recent.id}
                onClick={() => {
                  setMobileNav(false);
                  !recent.result && ["bot", "local"].includes(recent.mode)
                    ? resumeGame(recent)
                    : imported({
                        ...recent,
                        mode: "analysis",
                        started: true,
                        time: { base: 0, increment: 0 },
                      });
                }}
              >
                <span>{recent.title}</span>
                <small>
                  {Math.ceil(recent.moves.length / 2)}{" "}
                  {recent.moves.length <= 2 ? "move" : "moves"} ·{" "}
                  {!recent.result && ["bot", "local"].includes(recent.mode)
                    ? "Continue"
                    : "Review game"}
                </small>
              </button>
            ))
          ) : (
            <p>
              Your games will appear here.
              <br />
              Start with a quick 10-minute game.
            </p>
          )}
        </section>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="status-dot" />
            <span>
              Offline ready<small>Games stay on this device</small>
            </span>
            <ShieldCheck size={17} />
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            aria-label="Settings"
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            <span>Settings</span>
          </button>
          <button
            className="nav-item"
            aria-label="How to play"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={19} />
            <span>How to play</span>
          </button>
          <div className="sidebar-footer">
            <span>Knightfall v{appVersion}</span>
            <Heart size={12} />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>Clubhouse</span>
            <ChevronRight size={13} />
            <strong>
              {page === "settings"
                ? "Settings"
                : pages.find((p) => p.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <UpdateIndicator onOpen={() => navigate("settings")} />
            <span className="on-device">
              <span className="status-dot" /> Local play
            </span>
            <button
              className="icon-button"
              title="Install Knightfall"
              aria-label="Install Knightfall"
              onClick={() => setModal("install")}
            >
              <ArrowDownToLine size={18} />
            </button>
            <button
              className="header-rating"
              onClick={() => navigate("settings")}
              aria-label={`Your local Elo: ${ratings.rating}${ratings.provisional ? ", provisional" : ""}`}
            >
              <TrendingUp size={15} />
              <strong>{ratings.rating}</strong>
              <span>Local Elo</span>
            </button>
            <button
              className="profile-avatar"
              onClick={() => navigate("settings")}
              aria-label="Your profile"
            >
              <span aria-hidden="true">
                {settings.name.slice(0, 2).toUpperCase()}
              </span>
            </button>
          </div>
        </header>
        <main ref={mainRef} aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <h1 id="page-title">
                {page === "play" && settings.name !== "You"
                  ? `${settings.name}’s board`
                  : pageTitles[page].title}
              </h1>
              <p>{pageTitles[page].subtitle}</p>
            </div>
            {(page === "play" || page === "analysis") && (
              <button
                className="button subtle heading-action new-game-action"
                onClick={() => {
                  setModal("new");
                }}
              >
                <Plus size={16} /> New game
              </button>
            )}
            {page === "analysis" && (
              <div className="heading-action analysis-heading-actions">
                <button
                  className="button primary"
                  disabled={chess.isGameOver() || isLan}
                  onClick={() => setModal("practice")}
                >
                  <Play size={14} /> Play position
                </button>
                <button
                  className="button subtle"
                  onClick={() => {
                    const saved = saveGame(game);
                    setArchive(savedGames());
                    notify(
                      saved
                        ? "Game saved to your library."
                        : "This study could not be saved. Check available storage.",
                    );
                  }}
                >
                  <FolderHeart size={16} /> Save game
                </button>
                <button
                  className="button secondary"
                  onClick={() => setModal("editor")}
                >
                  <Settings2 size={16} /> Set up
                </button>
                <button
                  className="button secondary"
                  onClick={() => setModal("import")}
                >
                  <Upload size={16} /> Import game
                </button>
              </div>
            )}
          </div>
          {boardPage && (
            <div
              className={`play-layout ${page === "analysis" ? "analysis-layout" : ""}`}
            >
              <div className="board-column">
                {page === "play" && showSetup && !isLan && (
                  <div className="mobile-quick-start">
                    <button
                      className="button primary"
                      onClick={() =>
                        startGame({
                          mode: "bot",
                          botId: "scout",
                          color: "w",
                          time: { base: 600, increment: 0 },
                        })
                      }
                    >
                      <Play size={15} fill="currentColor" />
                      <span>
                        Quick play <small>Scout · 10 min</small>
                      </span>
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        document
                          .querySelector(".new-game-card")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    >
                      <Settings2 size={15} /> Customize
                    </button>
                  </div>
                )}
                <div className="board-meta">
                  <div className="board-mode">
                    <span className="status-dot" />
                    {isLan
                      ? `Wi-Fi · ${lanSnapshot.code}`
                      : page === "puzzles"
                        ? "Tactics trainer"
                        : selectedGambit
                          ? selectedGambit.name
                          : page === "analysis"
                            ? "Analysis board"
                            : game.mode === "local"
                              ? "Pass & play"
                              : "Play against the computer"}
                  </div>
                  <span className="casual-pill">
                    {page === "puzzles"
                      ? `${puzzleIndex + 1} / ${puzzles.length}`
                      : game.time.base === 0
                        ? "Untimed"
                        : `${Math.round(game.time.base / 60)}${game.time.increment ? ` + ${game.time.increment}` : " min"}`}
                    <span>·</span>
                    {page === "puzzles"
                      ? "Practice"
                      : ratingEligible
                        ? "Local rated"
                        : "Practice"}
                  </span>
                </div>
                <AlienAudio
                  gameId={game.id}
                  active={
                    settings.alienEasterEgg &&
                    (game.alienGambit === true ||
                      (game.mode === "lan" &&
                        playedAlienGambit(game.startFen, game.moves)))
                  }
                  enabled={settings.sound && settings.alienAudio}
                />
                {playerBar(topColor)}
                <div className="board-with-eval">
                  {page === "analysis" && (
                    <div
                      className="eval-bar"
                      aria-label={`Evaluation ${(evaluation / 100).toFixed(2)} pawns`}
                    >
                      <div
                        style={{
                          height: `${Math.min(95, Math.max(5, 50 + evaluation / 20))}%`,
                        }}
                      />
                      <span>{(Math.abs(evaluation) / 100).toFixed(1)}</span>
                    </div>
                  )}
                  <ChessBoard
                    fen={position}
                    alienTheme={
                      settings.alienEasterEgg &&
                      (game.alienGambit === true ||
                        (game.mode === "lan" &&
                          playedAlienGambit(game.startFen, game.moves)))
                    }
                    orientation={orientation}
                    onMove={makeMove}
                    disabled={!boardEnabled}
                    lastMove={
                      preview
                        ? preview.line.moves[preview.index] || null
                        : historyIndex >= 0
                          ? game.moves[historyIndex]
                          : null
                    }
                    arrows={arrows}
                    showCoordinates={settings.coordinates}
                    showLegalMoves={settings.legalMoves}
                    theme={settings.boardTheme}
                  />
                  {page === "analysis" &&
                    !preview &&
                    activeReview &&
                    activeReview.index === historyIndex &&
                    game.moves[historyIndex] && (
                      <span
                        className={`board-review-badge review-${activeReview.label.toLowerCase()}`}
                        role="img"
                        aria-label={`${game.moves[historyIndex].san}: ${activeReview.label}`}
                        style={{
                          left: `${((orientation === "w" ? game.moves[historyIndex].to.charCodeAt(0) - 97 : 104 - game.moves[historyIndex].to.charCodeAt(0)) + 1) * 12.5}%`,
                          top: `${(orientation === "w" ? 8 - Number(game.moves[historyIndex].to[1]) : Number(game.moves[historyIndex].to[1]) - 1) * 12.5}%`,
                        }}
                      >
                        {
                          {
                            Brilliant: "!!",
                            Great: "!",
                            Best: "★",
                            Excellent: "✓",
                            Good: "✓",
                            Book: "B",
                            Inaccuracy: "?!",
                            Mistake: "?",
                            Miss: "−",
                            Blunder: "??",
                          }[activeReview.label]
                        }
                      </span>
                    )}
                </div>
                {playerBar(bottomColor, true)}
                {page === "analysis" && activeReview && !preview && (
                  <div
                    className={`mobile-review-toolbar quality-${activeReview.label.toLowerCase()}`}
                  >
                    <button
                      className="mobile-review-feedback"
                      onClick={() =>
                        document
                          .querySelector(".analysis-studio")
                          ?.scrollIntoView({
                            behavior: window.matchMedia?.(
                              "(prefers-reduced-motion: reduce)",
                            ).matches
                              ? "auto"
                              : "smooth",
                            block: "start",
                          })
                      }
                    >
                      <span>
                        {activeReview.playedSAN}{" "}
                        <strong>{activeReview.label}</strong>
                      </span>
                      <small>
                        View feedback <ChevronRight size={12} />
                      </small>
                    </button>
                    <button
                      aria-label="Previous reviewed move"
                      disabled={historyIndex < 0}
                      onClick={() => selectReviewMove(historyIndex - 1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label="Next reviewed move"
                      disabled={historyIndex >= game.moves.length - 1}
                      onClick={() => selectReviewMove(historyIndex + 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
                {preview && (
                  <section
                    className="variation-bar"
                    aria-label="Analysis variation"
                  >
                    <div className="variation-heading">
                      <strong>
                        {preview.mode === "retry"
                          ? "Find a better move"
                          : "Exploring a line"}
                      </strong>
                      <button
                        onClick={() => {
                          setExploration(null);
                          setArrows([]);
                        }}
                      >
                        <X size={14} /> Back to game
                      </button>
                    </div>
                    <p role="status">
                      {preview.feedback ||
                        (preview.mode === "retry"
                          ? "Try your idea on the board. Your original game stays saved."
                          : "Step through this line, or move a piece to try your own idea.")}
                    </p>
                    <div className="variation-controls">
                      <button
                        aria-label="Previous variation move"
                        disabled={preview.index < 0}
                        onClick={() =>
                          setExploration((current) =>
                            current
                              ? {
                                  ...current,
                                  index: current.index - 1,
                                  playing: false,
                                }
                              : null,
                          )
                        }
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        aria-label={
                          preview.playing ? "Pause variation" : "Play variation"
                        }
                        disabled={!preview.line.moves.length}
                        onClick={() =>
                          setExploration((current) =>
                            current
                              ? {
                                  ...current,
                                  index:
                                    current.index >=
                                    current.line.moves.length - 1
                                      ? -1
                                      : current.index,
                                  playing: !current.playing,
                                }
                              : null,
                          )
                        }
                      >
                        {preview.playing ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                      </button>
                      <button
                        aria-label="Next variation move"
                        disabled={
                          preview.index >= preview.line.moves.length - 1
                        }
                        onClick={() =>
                          setExploration((current) =>
                            current
                              ? {
                                  ...current,
                                  index: current.index + 1,
                                  playing: false,
                                }
                              : null,
                          )
                        }
                      >
                        <ChevronRight size={17} />
                      </button>
                      <span>
                        {preview.index < 0
                          ? "Starting position"
                          : preview.line.moves[preview.index]?.san}{" "}
                        · {preview.index + 1}/{preview.line.moves.length}
                      </span>
                    </div>
                    {!!preview.line.moves.length && (
                      <div className="variation-moves">
                        {preview.line.moves.map((move, index) => (
                          <button
                            key={index}
                            className={
                              preview.index === index ? "selected" : ""
                            }
                            onClick={() =>
                              setExploration((current) =>
                                current
                                  ? { ...current, index, playing: false }
                                  : null,
                              )
                            }
                          >
                            {move.san}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                <div className="board-tools">
                  <div>
                    <button
                      className="icon-button"
                      title={focusMode ? "Exit focus view" : "Focus view"}
                      aria-label={focusMode ? "Exit focus view" : "Focus view"}
                      onClick={() => setFocusMode((v) => !v)}
                    >
                      <Maximize2 size={17} />
                    </button>
                    <button
                      className="icon-button"
                      title="Flip board (F)"
                      aria-label="Flip board"
                      onClick={() =>
                        setOrientation((o) => (o === "w" ? "b" : "w"))
                      }
                    >
                      <ArrowLeftRight size={18} />
                    </button>
                    <button
                      className="icon-button"
                      title="Take back"
                      aria-label="Take back move"
                      onClick={undo}
                      disabled={
                        (preview ? preview.index < 0 : !game.moves.length) ||
                        isLan ||
                        game.mode === "puzzle"
                      }
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      className="icon-button"
                      title={settings.sound ? "Mute sounds" : "Enable sounds"}
                      aria-label={
                        settings.sound ? "Mute sounds" : "Enable sounds"
                      }
                      onClick={() =>
                        setSettings((s) => ({ ...s, sound: !s.sound }))
                      }
                    >
                      {settings.sound ? (
                        <Volume2 size={18} />
                      ) : (
                        <VolumeX size={18} />
                      )}
                    </button>
                    <span className="tool-divider" />
                    <button
                      className="text-button hint-button"
                      onClick={() => void hint()}
                      disabled={hintBusy || isLan || !!game.result}
                    >
                      {hintBusy ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Lightbulb size={17} />
                      )}{" "}
                      Hint
                    </button>
                  </div>
                  <div>
                    {page === "analysis" && (
                      <>
                        <button
                          className="icon-button"
                          aria-label="Play this position"
                          title="Play this position"
                          disabled={chess.isGameOver() || isLan}
                          onClick={() => setModal("practice")}
                        >
                          <Play size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Set up position"
                          aria-label="Set up position"
                          onClick={() => setModal("editor")}
                        >
                          <Settings2 size={17} />
                        </button>
                      </>
                    )}
                    <button
                      className="icon-button"
                      title="Copy FEN"
                      aria-label="Copy FEN position"
                      onClick={() =>
                        void copy(position, "Position copied as FEN.")
                      }
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Export PGN"
                      aria-label="Export PGN game"
                      onClick={() => exportPgn()}
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </div>
                {!atLatest && !preview && (
                  <div className="history-notice">
                    <Clock3 size={15} />
                    <span>
                      Viewing an earlier position
                      {page === "analysis"
                        ? ". Play a move to explore a new line."
                        : ""}
                    </span>
                    <button
                      onClick={() => setHistoryIndex(game.moves.length - 1)}
                    >
                      Latest <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                {game.result &&
                  game.mode !== "puzzle" &&
                  page !== "analysis" && (
                    <div className="game-result" role="status">
                      <Trophy size={28} />
                      <div>
                        <h2>{resultTitle}</h2>
                        <p>
                          {game.result.reason}
                          {ratingEntry && (
                            <span
                              className={`result-rating ${ratingEntry.delta >= 0 ? "rating-up" : "rating-down"}`}
                            >
                              {" "}
                              · Local Elo {ratingEntry.after} (
                              {ratingEntry.delta >= 0 ? "+" : ""}
                              {ratingEntry.delta})
                            </span>
                          )}
                        </p>
                      </div>
                      {!isLan && (
                        <button
                          className="button primary"
                          onClick={() => setModal("new")}
                        >
                          <Plus size={15} /> New game
                        </button>
                      )}
                      {isLan ? (
                        <button
                          className="button primary"
                          onClick={() => lanRef.current?.rematch()}
                        >
                          {lanSnapshot.rematchVotes.includes(
                            lanSnapshot.yourColor!,
                          )
                            ? "Rematch requested"
                            : "Rematch"}
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          onClick={() => {
                            setPage("analysis");
                            setShowSetup(false);
                          }}
                        >
                          Review game <ArrowRight size={15} />
                        </button>
                      )}
                    </div>
                  )}
                {page === "play" && !isLan && (
                  <div className="underboard-tip">
                    <Lightbulb size={17} />
                    <p>
                      <strong>At the board</strong>
                      <span>
                        <kbd>F</kbd> flip &nbsp; <kbd>←</kbd> <kbd>→</kbd>{" "}
                        replay &nbsp; Right-drag to draw an arrow
                      </span>
                    </p>
                  </div>
                )}
                {page === "analysis" && (
                  <details className="analysis-notebook">
                    <summary>
                      <h2>Scoresheet & notes</h2>
                    </summary>
                    <MoveList
                      game={game}
                      index={historyIndex}
                      onSelect={selectReviewMove}
                    />
                    {!isLan && (
                      <GameNotes
                        game={game}
                        index={historyIndex}
                        onChange={(index, comment) => {
                          const next =
                            index < 0
                              ? { ...game, initialComment: comment }
                              : {
                                  ...game,
                                  moves: game.moves.map((move, i) =>
                                    i === index ? { ...move, comment } : move,
                                  ),
                                };
                          setGame(next);
                          writeStore("current", next);
                          saveGame(next);
                          setArchive(savedGames());
                        }}
                      />
                    )}
                  </details>
                )}
              </div>
              <aside className="game-panel" aria-label="Game tools">
                {page === "play" && selectedDrill && (
                  <section className="card drill-status">
                    <span className="eyebrow">
                      ENDGAME PRACTICE ·{" "}
                      {selectedDrill.objective === "draw"
                        ? "HOLD THE DRAW"
                        : "CONVERT THE WIN"}
                    </span>
                    <h3>{selectedDrill.title}</h3>
                    <p>{selectedDrill.goal}</p>
                    <details>
                      <summary>The plan</summary>
                      <p>{selectedDrill.lesson}</p>
                    </details>
                    {game.result && (
                      <div className="drill-outcome">
                        {(selectedDrill.objective === "win" &&
                          game.result.winner === game.playerColor) ||
                        (selectedDrill.objective === "draw" &&
                          game.result.winner === null)
                          ? "Goal achieved. Well played!"
                          : "A useful lesson. Reset and try a different plan."}
                      </div>
                    )}
                    <div>
                      <button
                        className="text-button"
                        onClick={() => startDrill(selectedDrill)}
                      >
                        Reset position <RotateCcw size={13} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => navigate("endgames")}
                      >
                        All drills <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                )}
                {page === "play" &&
                  (showSetup && !isLan ? (
                    <NewGamePanel
                      onStart={startGame}
                      onWifi={() => navigate("multiplayer")}
                      initialBot={game.botId}
                    />
                  ) : (
                    <>
                      <section className="card game-status-card">
                        <div className="panel-heading">
                          <h3>
                            {isLan ? "Your Wi-Fi room" : "Game in progress"}
                          </h3>
                          <span className="soft-badge">
                            {isLan
                              ? lanSnapshot.code
                              : game.mode === "bot"
                                ? "vs computer"
                                : "Local"}
                          </span>
                        </div>
                        {isLan && lanSnapshot.status === "waiting" ? (
                          <>
                            <div className="waiting-illustration">
                              <Wifi size={36} />
                            </div>
                            <h2>Waiting for a friend.</h2>
                            <p>
                              Open the host’s local address on another device,
                              then join with this room code.
                            </p>
                            <button
                              className="room-code"
                              onClick={() =>
                                void copy(lanSnapshot.code, "Room code copied.")
                              }
                            >
                              {lanSnapshot.code}
                              <Copy size={18} />
                            </button>
                            <p className="fine-print">
                              Open the address on the same Wi-Fi network:
                            </p>
                            <div className="lan-address-list">
                              {(
                                lanRef.current?.hostUrls.filter(
                                  (url) =>
                                    ![
                                      "127.0.0.1",
                                      "localhost",
                                      "[::1]",
                                    ].includes(new URL(url).hostname),
                                ) || []
                              ).map((url) => (
                                <button
                                  key={url}
                                  onClick={() =>
                                    void copy(url, "Host address copied.")
                                  }
                                >
                                  {url}
                                  <Copy size={13} />
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="status-message">
                              <span
                                className={`status-dot ${thinking ? "pulsing" : ""}`}
                              />
                              {game.result
                                ? `${resultTitle} · ${game.result.reason}`
                                : !game.started
                                  ? "Game paused"
                                  : thinking
                                    ? `${currentBot.name} is thinking…`
                                    : new Chess(game.fen).isCheck()
                                      ? "Check. Protect your king."
                                      : `${playerName(turn)} to move`}
                            </div>
                            <p>
                              {isLan
                                ? "A friendly game, connected locally."
                                : game.mode === "bot"
                                  ? ratingEligible
                                    ? "Finish this game to update your Local Elo. Hints and takebacks switch it to practice."
                                    : "Practice game. Try a hint or take back a move whenever you need."
                                  : "Share the board. The next move is yours."}
                            </p>
                          </>
                        )}
                        {isLan &&
                          lanSnapshot.drawOffer &&
                          lanSnapshot.drawOffer !== lanSnapshot.yourColor && (
                            <div className="draw-offer">
                              <p>Your opponent offers a draw.</p>
                              <button
                                className="button primary"
                                onClick={() => lanRef.current?.acceptDraw()}
                              >
                                Accept
                              </button>
                              <button
                                className="button secondary"
                                onClick={() => lanRef.current?.declineDraw()}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                        {isLan && lanConnection !== "connected" && (
                          <p className="inline-error">
                            {lanConnection === "disconnected"
                              ? "Disconnected. Open Play with friends and resume this room."
                              : "Connection interrupted. Reconnecting to the host…"}
                          </p>
                        )}
                        {game.mode === "bot" && game.started && (
                          <p className="active-engine-label">
                            <Cpu size={12} />
                            {engineName === "Knightfall Lite"
                              ? "Knightfall Lite · basic fallback engine"
                              : engineName}
                          </p>
                        )}
                        {!game.started &&
                          !isLan &&
                          ["bot", "local"].includes(game.mode) && (
                            <button
                              className="button primary full"
                              onClick={() => {
                                clockAnchor.current = performance.now();
                                setGame((g) => ({ ...g, started: true }));
                              }}
                            >
                              Resume saved game
                            </button>
                          )}
                      </section>
                      <MoveList
                        game={game}
                        index={historyIndex}
                        onSelect={selectReviewMove}
                      />
                      {!game.result && game.started && (
                        <GameActions
                          onNew={() => setModal("new")}
                          onResign={() => setModal("resign")}
                          onDraw={() => {
                            if (isLan) {
                              lanRef.current?.offerDraw();
                              notify("Draw offer sent.");
                            } else setModal("draw");
                          }}
                          allowDraw={game.mode !== "bot"}
                        />
                      )}{" "}
                      {isLan && lanSnapshot.status === "waiting" && (
                        <button
                          className="button secondary full"
                          onClick={() => {
                            leaveLan();
                            setShowSetup(true);
                            replaceGame(newSession());
                          }}
                        >
                          Leave room
                        </button>
                      )}
                      {isLan &&
                        lanSnapshot.result &&
                        lanSnapshot.rematchVotes.some(
                          (c) => c !== lanSnapshot.yourColor,
                        ) && (
                          <p className="fine-print">
                            Your opponent would like a rematch. Select Rematch
                            to play again.
                          </p>
                        )}
                    </>
                  ))}
                {page === "analysis" && (
                  <>
                    {selectedGambit && (
                      <section className="card opening-detail">
                        <span className="eyebrow">
                          {selectedGambit.category === "creator"
                            ? "FROM CHESS CULTURE"
                            : "OPENING SPOTLIGHT"}
                        </span>
                        <h2>{selectedGambit.name}</h2>
                        {selectedGambit.creator && (
                          <span className="creator-tag">
                            {selectedGambit.creator}
                          </span>
                        )}
                        <p>{selectedGambit.description}</p>
                        <h4>The idea</h4>
                        <p>{selectedGambit.idea}</p>
                        <h4>Keep in mind</h4>
                        <p>{selectedGambit.risk}</p>
                        <div className="opening-detail-actions">
                          <button
                            className="button secondary"
                            onClick={() => {
                              const g = selectedGambit;
                              const next = newSession({
                                mode: "gambit",
                                started: true,
                                time: { base: 0, increment: 0 },
                                title: g.name,
                              });
                              replaceGame(next);
                              setSelectedGambit(g);
                              setGambitPractice(true);
                              setPracticeIndex(0);
                              notify(
                                "Rehearse both sides of the line. Play the opening moves from memory.",
                              );
                            }}
                          >
                            <Target size={15} /> Rehearse line
                          </button>
                          <button
                            className="text-button"
                            onClick={() => openGambit(selectedGambit)}
                          >
                            Replay <RotateCcw size={14} />
                          </button>
                        </div>
                        {gambitPractice && (
                          <div className="practice-progress">
                            Move {practiceIndex + 1} of{" "}
                            {selectedGambit.moves.length} ·{" "}
                            {new Chess(game.fen).turn() === "w"
                              ? "White"
                              : "Black"}{" "}
                            to move
                          </div>
                        )}
                      </section>
                    )}
                    <AnalysisPanel
                      key={`${settings.engineMode}:${settings.engineThreads}:${settings.analysisTime}`}
                      engineMode={settings.engineMode}
                      engineThreads={settings.engineThreads}
                      searchTime={settings.analysisTime}
                      fen={position}
                      game={game}
                      activeIndex={historyIndex}
                      onActiveReview={setActiveReview}
                      onPreviewLine={previewLine}
                      onRetryMove={retryReviewMove}
                      onEvaluation={setEvaluation}
                      onArrow={(from, to) => setArrows([{ from, to }])}
                      onImport={() => setModal("import")}
                      onReviewSelect={selectReviewMove}
                    />
                  </>
                )}
                {page === "puzzles" && (
                  <>
                    <section className="card puzzle-card">
                      <div className="panel-heading">
                        <span className="soft-badge">DAILY PRACTICE</span>
                        <span className="puzzle-rating">
                          <Target size={15} />
                          {puzzle.rating}
                        </span>
                      </div>
                      <div className="puzzle-icon">
                        <Puzzle size={30} />
                      </div>
                      <h2>
                        {puzzleStatus === "solved"
                          ? "Nicely calculated."
                          : puzzleStatus === "revealed"
                            ? "A new pattern to remember."
                            : puzzle.title}
                      </h2>
                      <p>
                        {puzzleStatus === "solved" ||
                        puzzleStatus === "revealed"
                          ? puzzle.explanation
                          : `${game.playerColor === "w" ? "White" : "Black"} to move. Find the best sequence.`}
                      </p>
                      <div
                        className={`puzzle-feedback ${puzzleStatus}`}
                        role="status"
                      >
                        {puzzleStatus === "wrong" ? (
                          <>
                            <RotateCcw size={17} /> Not quite. Try another idea.
                          </>
                        ) : puzzleStatus === "solved" ? (
                          <>
                            <Check size={17} />{" "}
                            {puzzleAttempts
                              ? "Solved with assistance"
                              : "Solved. Well played!"}
                          </>
                        ) : puzzleStatus === "revealed" ? (
                          <>
                            <BookOpen size={17} /> Study the line, then try the
                            next one.
                          </>
                        ) : (
                          <>
                            <Lightbulb size={17} /> Look for forcing moves.
                          </>
                        )}
                      </div>
                      <div className="puzzle-progress">
                        <span>
                          {Math.min(puzzlePly, puzzle.solution.length)} /{" "}
                          {puzzle.solution.length} half-moves
                        </span>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${(puzzlePly / puzzle.solution.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      {puzzleStatus === "solved" ||
                      puzzleStatus === "revealed" ? (
                        <button
                          className="button primary full"
                          onClick={nextPuzzle}
                        >
                          Next puzzle <ArrowRight size={17} />
                        </button>
                      ) : (
                        <>
                          <button
                            className="button secondary full"
                            onClick={() => void hint()}
                          >
                            <Lightbulb size={16} /> Hint
                          </button>
                          <button
                            className="text-button full reveal-button"
                            onClick={() => {
                              let next = newSession({
                                mode: "puzzle",
                                startFen: puzzle.fen,
                                fen: puzzle.fen,
                                playerColor: new Chess(puzzle.fen).turn(),
                                started: true,
                                time: { base: 0, increment: 0 },
                                title: puzzle.title,
                              });
                              for (const m of puzzle.solution)
                                next =
                                  applyMove(
                                    next,
                                    m.slice(0, 2),
                                    m.slice(2, 4),
                                    m[4],
                                  ) || next;
                              timeoutEpoch.current++;
                              setGame(next);
                              setHistoryIndex(next.moves.length - 1);
                              setPuzzlePly(puzzle.solution.length);
                              setPuzzleStatus("revealed");
                              setPuzzleAttempts((n) => n + 1);
                            }}
                          >
                            Show solution
                          </button>
                        </>
                      )}
                      <div className="puzzle-theme">
                        <span>Theme</span>
                        <strong>{puzzle.theme}</strong>
                      </div>
                    </section>
                    <section className="card training-stats">
                      <h3>Your practice</h3>
                      <div>
                        <span>
                          <strong>{solved.length}</strong>solved unassisted
                        </span>
                        <span>
                          <strong>{puzzles.length}</strong>curated puzzles
                        </span>
                      </div>
                      <label className="field-label" htmlFor="puzzle-theme">
                        EXPLORE A THEME
                      </label>
                      <select
                        id="puzzle-theme"
                        value={puzzleFilter}
                        onChange={(e) => {
                          setPuzzleFilter(e.target.value);
                          const i = puzzles.findIndex(
                            (p) =>
                              e.target.value === "All themes" ||
                              p.theme === e.target.value,
                          );
                          if (i >= 0) loadPuzzle(i);
                        }}
                      >
                        <option>All themes</option>
                        {[...new Set(puzzles.map((p) => p.theme))].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <button className="text-button full" onClick={nextPuzzle}>
                        Skip to next puzzle <ArrowRight size={14} />
                      </button>
                    </section>
                    <MoveList
                      game={game}
                      index={historyIndex}
                      onSelect={selectReviewMove}
                    />
                  </>
                )}
                {page === "play" && (
                  <div className="mini-puzzle-card">
                    <div>
                      <span className="eyebrow">TACTICS PRACTICE</span>
                      <h3>Find the winning move.</h3>
                      <button
                        className="text-button"
                        onClick={() => navigate("puzzles")}
                      >
                        Solve a puzzle <ArrowRight size={15} />
                      </button>
                    </div>
                    <Puzzle size={45} strokeWidth={1.2} />
                  </div>
                )}
              </aside>
            </div>
          )}
          {page === "challenge" && (
            <PuzzleRush
              onStudyPuzzle={(id) => {
                const index = puzzles.findIndex((p) => p.id === id);
                if (index >= 0) loadPuzzle(index);
              }}
            />
          )}
          {page === "endgames" && <EndgameSchool onPractice={startDrill} />}
          {page === "openings" && (
            <LearnHub
              onEndgames={() => navigate("endgames")}
              onExplore={openGambit}
              onPuzzle={() => navigate("puzzles")}
            />
          )}
          {page === "multiplayer" && <NetworkPanel onGame={onLanGame} />}
          {page === "games" && (
            <div className="library-page">
              <div className="library-summary">
                <div className="card library-stat">
                  <FolderHeart size={24} />
                  <span>
                    <strong>{archive.length}</strong>saved games
                  </span>
                </div>
                <div className="card library-stat">
                  <Trophy size={24} />
                  <span>
                    <strong>
                      {
                        archive.filter(
                          (g) => g.result?.winner === g.playerColor,
                        ).length
                      }
                    </strong>
                    wins recorded
                  </span>
                </div>
                <div className="card library-stat">
                  <Puzzle size={24} />
                  <span>
                    <strong>{solved.length}</strong>puzzles solved
                  </span>
                </div>
              </div>
              <div className="library-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    placeholder="Search your games…"
                    aria-label="Search games"
                    value={gameSearch}
                    onChange={(e) => setGameSearch(e.target.value)}
                  />
                </div>
                <button
                  className="button secondary"
                  onClick={() => setModal("import")}
                >
                  <Upload size={16} /> Import a game
                </button>
              </div>
              <div className="card games-table">
                <div className="games-table-head">
                  <span>Game</span>
                  <span>Result</span>
                  <span>Moves</span>
                  <span>Played</span>
                  <span />
                </div>
                {archive
                  .filter((g) =>
                    g.title.toLowerCase().includes(gameSearch.toLowerCase()),
                  )
                  .map((g) => (
                    <div className="game-row" key={g.id}>
                      <button
                        className="game-row-title"
                        onClick={() =>
                          imported({
                            ...g,
                            mode: "analysis",
                            started: true,
                            time: { base: 0, increment: 0 },
                          })
                        }
                      >
                        <span className="game-row-icon">
                          {g.mode === "bot" ? (
                            <Cpu size={20} />
                          ) : g.mode === "lan" ? (
                            <Wifi size={20} />
                          ) : (
                            <Play size={20} />
                          )}
                        </span>
                        <span>
                          <strong>{g.title}</strong>
                          <small>
                            {g.mode === "bot"
                              ? "Computer"
                              : g.mode === "lan"
                                ? "Wi-Fi game"
                                : "Local game"}{" "}
                            ·{" "}
                            {g.time.base
                              ? `${g.time.base / 60} min`
                              : "Untimed"}
                          </small>
                        </span>
                      </button>
                      <span
                        className={`result-badge ${g.result?.winner === g.playerColor ? "win" : ""}`}
                      >
                        {g.result
                          ? g.result.winner === null
                            ? "Draw"
                            : g.result.winner === g.playerColor
                              ? "Won"
                              : "Lost"
                          : "In progress"}
                      </span>
                      <span>{Math.ceil(g.moves.length / 2)}</span>
                      <span className="muted">
                        {new Date(g.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="row-actions">
                        {!g.result && ["bot", "local"].includes(g.mode) && (
                          <button
                            className="icon-button"
                            aria-label={`Resume ${g.title}`}
                            title="Resume game"
                            onClick={() => resumeGame(g)}
                          >
                            <Play size={15} />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={`Export ${g.title}`}
                          onClick={() => exportPgn(g)}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${g.title}`}
                          onClick={() => {
                            const next = archive.filter((a) => a.id !== g.id);
                            setArchive(next);
                            writeStore("games", next);
                            notify("Game removed from your library.");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                {!archive.length && (
                  <div className="empty-library">
                    <FolderHeart size={48} strokeWidth={1.2} />
                    <h2>No saved games yet</h2>
                    <p>
                      Play a game and it will be saved automatically on this
                      device.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => navigate("play")}
                    >
                      Let’s play <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {archive.length > 0 &&
                  !archive.some((g) =>
                    g.title.toLowerCase().includes(gameSearch.toLowerCase()),
                  ) && (
                    <div className="empty-library">
                      <Search size={32} />
                      <h3>No games match that search.</h3>
                    </div>
                  )}
              </div>
              <p className="privacy-footer">
                <ShieldCheck size={15} /> Saved in this browser on this device.
                Export your PGN files to keep a backup.
              </p>
            </div>
          )}
          {page === "settings" && (
            <div className="settings-layout">
              <section className="card settings-card">
                <div className="panel-heading">
                  <h2>Player and board settings</h2>
                  <Settings2 size={20} />
                </div>
                <label className="field-label" htmlFor="player-name">
                  YOUR NAME
                </label>
                <form
                  className="name-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = nameDraft.trim();
                    if (
                      !name ||
                      name.length > 24 ||
                      /[\u0000-\u001f\u007f]/.test(name)
                    ) {
                      setNameError(
                        "Use 1–24 characters, without control characters.",
                      );
                      return;
                    }
                    setSettings((current) => ({ ...current, name }));
                    setNameDraft(name);
                    setNameError("");
                    notify("Name saved.");
                  }}
                >
                  <input
                    id="player-name"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    aria-describedby="name-help"
                    aria-invalid={!!nameError}
                  />
                  <button className="button primary" type="submit">
                    Save name
                  </button>
                  <p id="name-help" role={nameError ? "alert" : undefined}>
                    {nameError ||
                      "1–24 characters. Changes apply when you save."}
                  </p>
                </form>
                <label className="alien-setting">
                  <input
                    type="checkbox"
                    checked={settings.alienEasterEgg}
                    onChange={(event) =>
                      setSettings((s) => ({
                        ...s,
                        alienEasterEgg: event.target.checked,
                      }))
                    }
                  />{" "}
                  Alien Gambit Easter egg
                </label>
                <p className="review-estimate-note">
                  Playing Wittythealien’s Alien Gambit turns the pieces into
                  alien tokens for the rest of that game. Turn this off for
                  ordinary pieces and no Easter egg sound.
                </p>
                <label className="alien-setting">
                  <input
                    type="checkbox"
                    checked={settings.alienAudio}
                    onChange={(event) =>
                      setSettings((s) => ({
                        ...s,
                        alienAudio: event.target.checked,
                      }))
                    }
                  />{" "}
                  Alien Gambit sound
                </label>
                <p className="review-estimate-note">
                  Play the short celebration once when the gambit is completed.
                  Muting sounds also silences this clip.
                </p>
                <fieldset className="engine-preferences">
                  <legend>Local engine</legend>
                  <label>
                    Engine strength
                    <select
                      aria-label="Engine strength"
                      value={settings.engineMode}
                      onChange={(event) =>
                        setSettings((s) => ({
                          ...s,
                          engineMode: event.target.value as "lite" | "full",
                        }))
                      }
                    >
                      <option value="lite">
                        Stockfish Lite · lighter on your device
                      </option>
                      <option value="full">
                        Stockfish Full NNUE · stronger analysis
                      </option>
                    </select>
                  </label>
                  <p>
                    Full uses a larger neural network and more memory. On the
                    web, the first use loads about 75 MB. Native apps include it
                    for offline play. Keep Lite for lower battery use.
                  </p>
                  <label>
                    CPU cores
                    <select
                      aria-label="Engine CPU cores"
                      value={settings.engineThreads}
                      onChange={(event) =>
                        setSettings((s) => ({
                          ...s,
                          engineThreads: Number(event.target.value),
                        }))
                      }
                    >
                      {[1, 2, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    Full uses multiple cores when supported; otherwise it uses
                    the full single-core engine.
                  </small>
                  <label>
                    Analysis time per position
                    <select
                      aria-label="Analysis thinking time"
                      value={settings.analysisTime}
                      onChange={(event) =>
                        setSettings((s) => ({
                          ...s,
                          analysisTime: Number(event.target.value),
                        }))
                      }
                    >
                      {[650, 1200, 3000, 8000, 15000].map((n) => (
                        <option key={n} value={n}>
                          {n / 1000} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximum bot thinking time
                    <select
                      aria-label="Maximum bot thinking time"
                      value={settings.botTime}
                      onChange={(event) =>
                        setSettings((s) => ({
                          ...s,
                          botTime: Number(event.target.value),
                        }))
                      }
                    >
                      {[1500, 3000, 8000, 15000].map((n) => (
                        <option key={n} value={n}>
                          {n / 1000} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    Select the Stockfish opponent to play at maximum strength.
                    Longer searches use more battery; timed games still use the
                    game clock. Changing engine settings restarts analysis.
                  </small>
                </fieldset>
                <div className="field-label">BOARD COLORS</div>
                <div className="theme-picker">
                  {(["sage", "walnut", "ocean"] as const).map((t) => (
                    <button
                      key={t}
                      className={`theme-option ${settings.boardTheme === t ? "selected" : ""}`}
                      onClick={() =>
                        setSettings((s) => ({ ...s, boardTheme: t }))
                      }
                    >
                      <span className={`theme-preview ${t}`}>
                        {Array.from({ length: 16 }, (_, i) => (
                          <i
                            key={i}
                            className={
                              (Math.floor(i / 4) + i) % 2 ? "dark" : ""
                            }
                          />
                        ))}
                      </span>
                      <strong>{t[0].toUpperCase() + t.slice(1)}</strong>
                      {settings.boardTheme === t && <Check size={15} />}
                    </button>
                  ))}
                </div>
                {[
                  {
                    key: "sound",
                    name: "Move sounds",
                    desc: "Play a sound after each move.",
                  },
                  {
                    key: "coordinates",
                    name: "Board coordinates",
                    desc: "Show file letters and rank numbers.",
                  },
                  {
                    key: "legalMoves",
                    name: "Legal move hints",
                    desc: "See available squares when you select a piece.",
                  },
                ].map((row) => (
                  <div className="setting-row" key={row.key}>
                    <div>
                      <strong>{row.name}</strong>
                      <p>{row.desc}</p>
                    </div>
                    <button
                      className={`switch ${settings[row.key as "sound"] ? "on" : ""}`}
                      role="switch"
                      aria-label={row.name}
                      aria-checked={!!settings[row.key as "sound"]}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          [row.key]: !s[row.key as "sound"],
                        }))
                      }
                    >
                      <span />
                    </button>
                  </div>
                ))}
              </section>
              <div className="settings-aside">
                <RatingCard ledger={ratings} />
                <UpdateCard />
                <section className="card about-card">
                  <img src="./icon.svg" alt="" />
                  <h2>About Knightfall</h2>
                  <p>
                    Knightfall is an independent chess studio. Play offline,
                    explore ideas, and share a game across the room.
                  </p>
                  <div className="about-feature">
                    <Cpu size={18} />
                    <span>
                      <strong>Local engine</strong>Stockfish 17.1 Lite or Full
                      NNUE, with a lightweight fallback.
                    </span>
                  </div>
                  <div className="about-feature">
                    <ShieldCheck size={18} />
                    <span>
                      <strong>Your game data</strong>No account, analytics, or
                      cloud game uploads.
                    </span>
                  </div>
                  <div className="about-feature">
                    <Wifi size={18} />
                    <span>
                      <strong>Same-Wi-Fi games</strong>Host a room for players
                      on your local network.
                    </span>
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() => setModal("install")}
                  >
                    <Download size={16} /> Install Knightfall
                  </button>
                  <p className="fine-print">
                    Knightfall v{appVersion} · GPL-3.0-or-later. Chess rules by chess.js.
                    Pieces by Colin M. L. Burnett, CC BY-SA 3.0. Stockfish is
                    GPLv3. Creator mentions are educational; no endorsement or
                    affiliation is implied.
                  </p>
                </section>
                <section className="card backup-card">
                  <h3>Back up your games</h3>
                  <p>
                    Back up your saved games, Local Elo, settings, and puzzle
                    progress.
                  </p>
                  <button
                    className="button secondary full"
                    onClick={() =>
                      void downloadFile(
                        "knightfall-backup.json",
                        JSON.stringify(
                          {
                            version: 1,
                            games: archive,
                            settings,
                            solved,
                            ratings,
                          },
                          null,
                          2,
                        ),
                        "application/json",
                      )
                        .then((saved) => {
                          if (saved) notify("Backup export ready.");
                        })
                        .catch(() =>
                          notify(
                            "Could not save this backup. Please try again.",
                          ),
                        )
                    }
                  >
                    <Download size={16} /> Download a backup
                  </button>
                  <label className="button subtle full restore-label">
                    <Upload size={15} /> Restore a backup
                    <input
                      type="file"
                      accept=".json"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 25e6)
                            throw new Error(
                              "Backup is too large. Please use a file under 25 MB.",
                            );
                          const data = JSON.parse(await file.text());
                          if (data.version !== 1 || !Array.isArray(data.games))
                            throw new Error("Not a Knightfall backup.");
                          const valid = data.games
                            .slice(0, 200)
                            .map(validateSavedGame)
                            .filter(
                              (g: GameSession | null): g is GameSession =>
                                g !== null,
                            );
                          writeStore(
                            "games",
                            [
                              ...valid,
                              ...archive.filter(
                                (old) =>
                                  !valid.some(
                                    (g: GameSession) => g.id === old.id,
                                  ),
                              ),
                            ].slice(0, 200),
                          );
                          setArchive(savedGames());
                          if (data.settings)
                            setSettings(sanitizeSettings(data.settings));
                          if (Array.isArray(data.solved)) {
                            const progress = sanitizeSolved(data.solved);
                            setSolved(progress);
                            writeStore("solved", progress);
                          }
                          if (data.ratings)
                            commitRatings(
                              mergeRatingLedgers(
                                ratingsRef.current,
                                data.ratings,
                              ),
                            );
                          notify(`Restored ${valid.length} games.`);
                        } catch (e) {
                          notify(
                            e instanceof Error
                              ? e.message
                              : "Could not restore backup.",
                          );
                        }
                      }}
                    />
                  </label>
                </section>
              </div>
            </div>
          )}
          <footer className="main-footer">
            <span>Knightfall · Independent chess software</span>
            <span>No accounts. No ads.</span>
          </footer>
        </main>
      </div>
      <div className="sr-only" aria-live="polite">
        {game.result
          ? `${resultTitle}. ${game.result.reason}.`
          : `${turn === "w" ? "White" : "Black"} to move.${game.moves.length ? ` Last move: ${game.moves[game.moves.length - 1].san}.` : ""}`}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "editor" && (
        <Modal title="Set up a position" size="wide" onClose={closeModal}>
          <BoardEditor
            initialFen={position}
            onAnalyze={(fen) => {
              setModal(null);
              imported(importFen(fen));
            }}
            onClose={closeModal}
          />
        </Modal>
      )}
      {modal === "import" && (
        <ImportDialog onClose={closeModal} onImport={imported} />
      )}
      {modal === "practice" && (
        <Modal title="Play this position." onClose={closeModal}>
          <NewGamePanel
            onStart={(options) => startGame({ ...options, startFen: position })}
            onWifi={() => {
              setModal(null);
              navigate("multiplayer");
            }}
            initialBot="sage"
            initialTimeIndex={5}
          />
        </Modal>
      )}
      {modal === "new" && (
        <Modal title="A fresh board. A fresh start." onClose={closeModal}>
          <NewGamePanel
            onStart={startGame}
            onWifi={() => {
              setModal(null);
              navigate("multiplayer");
            }}
            initialBot={game.botId}
          />
        </Modal>
      )}
      {modal === "leave" && (
        <Modal title="Leave your Wi-Fi game?" onClose={closeModal}>
          <p>
            Your opponent will win if you leave this active game. You can review
            it afterward in My games.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={closeModal}>
              Keep playing
            </button>
            <button
              className="button danger"
              onClick={() => {
                const action = pendingAction.current;
                pendingAction.current = null;
                setModal(null);
                action?.();
              }}
            >
              Leave game
            </button>
          </div>
        </Modal>
      )}
      {modal === "resign" && (
        <Modal title="Resign this game?" onClose={closeModal}>
          <p>
            Your opponent will win. You can review the game and learn from it
            afterward.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={closeModal}>
              Keep playing
            </button>
            <button
              className="button danger"
              onClick={() => {
                if (isLan) lanRef.current?.resign();
                else {
                  const current = settleClock();
                  if (!current.result)
                    setGame({
                      ...current,
                      result: {
                        winner:
                          (current.mode === "bot"
                            ? current.playerColor
                            : new Chess(current.fen).turn()) === "w"
                            ? "b"
                            : "w",
                        reason: "Resignation",
                      },
                    });
                }
                setModal(null);
              }}
            >
              <Flag size={16} /> Resign
            </button>
          </div>
        </Modal>
      )}
      {modal === "draw" && (
        <Modal title="Agree to a draw?" onClose={closeModal}>
          <p>
            For a shared-screen game, both players should agree before ending
            the game.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={closeModal}>
              Keep playing
            </button>
            <button
              className="button primary"
              onClick={() => {
                const current = settleClock();
                if (!current.result)
                  setGame({
                    ...current,
                    result: { winner: null, reason: "Draw by agreement" },
                  });
                setModal(null);
              }}
            >
              <Handshake size={16} /> Both players agree
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Welcome to your chess space." onClose={closeModal}>
          <div className="help-list">
            <p>
              <strong>Make a move</strong>Click a piece, then its destination.
              You can also drag a piece. Highlighted dots show legal moves.
              Right-drag to draw an arrow; right-click to mark a square. Escape
              clears annotations. Choose a piece when a pawn promotes.
            </p>
            <p>
              <strong>Play your way</strong>Choose a local bot, pass the device
              between two players, or host a room for a friend on the same
              Wi-Fi.
            </p>
            <p>
              <strong>Review a position</strong>Open Analysis for engine
              suggestions and game review. Import PGN games or FEN positions.
              Click the move list to replay.
            </p>
            <p>
              <strong>Build your chess instinct</strong>Practice verified
              puzzles and explore famous gambits in the Learn chess. Rehearse a
              line from memory.
            </p>
            <p>
              <strong>Keyboard shortcuts</strong>
              <kbd>F</kbd> flips the board. <kbd>←</kbd> <kbd>→</kbd> replay
              moves. On the board, arrow keys select squares and Enter plays a
              move.
            </p>
            <p className="fine-print">
              All games are casual. Bot levels and game-quality scores are
              training estimates. Saved games remain on this device; export
              backups to keep them.
            </p>
          </div>
        </Modal>
      )}
      {modal === "install" && (
        <Modal title="Your chess. Wherever you are." onClose={closeModal}>
          <div className="install-hero">
            <img src="./icon.svg" alt="" />
            <p>Install Knightfall for a focused, offline chess experience.</p>
          </div>
          <div className="install-options">
            <div>
              <strong>Web & mobile</strong>
              <p>
                {installPrompt
                  ? "Install the web app directly on this device."
                  : "In Chrome or Edge, choose Install app from the browser menu. On iPhone, use Share → Add to Home Screen."}
              </p>
              {installPrompt && (
                <button
                  className="button primary"
                  onClick={async () => {
                    await installPrompt.prompt();
                    setInstallPrompt(null);
                  }}
                >
                  <Download size={16} /> Install app
                </button>
              )}
            </div>
            <div>
              <strong>Windows app</strong>
              <p>
                The portable Windows app includes local bots, analysis, and a
                one-click Wi-Fi host. Download the .exe from the project’s
                delivery files.
              </p>
            </div>
            <div>
              <strong>Android app</strong>
              <p>
                Install the Android APK from the project’s delivery files, or
                use the web app. iOS builds require Xcode and Apple signing.
              </p>
            </div>
          </div>
          <p className="fine-print">
            Open the app online once and allow its assets to finish loading
            before going offline. Desktop and Android packages bundle the
            engine.
          </p>
        </Modal>
      )}
    </div>
  );
}
