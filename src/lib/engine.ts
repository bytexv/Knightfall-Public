import { Chess } from "chess.js";
import {
  searchPosition,
  type SearchLine,
  type SearchOptions,
  type SearchResult,
} from "./engine-fallback";
import { validatedPosition } from "./engine-position";

export type EngineLine = SearchLine;
export type EngineResult = SearchResult;
export type EngineOptions = SearchOptions;
export type EngineStatus =
  | "idle"
  | "loading"
  | "ready"
  | "fallback"
  | "destroyed";

interface EngineWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface LocalEngineOptions {
  /** Useful when deploying under a subdirectory. Defaults to the app's base URL. */
  workerUrl?: string;
  mode?: "lite" | "full";
  threads?: number;
  initializationTimeout?: number;
  /** Hash table size in MiB, bounded to 4–64. Defaults to 16 for mobile memory use. */
  hashMb?: number;
  /** Release an unused worker after this delay; zero disables the idle timer. */
  idleTimeoutMs?: number;
  onStatus?: (status: EngineStatus, engine: string) => void;
  onInfo?: (line: EngineLine) => void;
  /** Injection point for deterministic UCI protocol tests. */
  workerFactory?: (url: string) => EngineWorker;
}

interface Job {
  id: number;
  fen: string;
  options: EngineOptions;
  resolve: (result: EngineResult) => void;
  reject: (error: Error) => void;
  lines: Map<number, EngineLine>;
  aborted: boolean;
  watchdog?: ReturnType<typeof setTimeout>;
}

function abortedError(): Error {
  return new DOMException("Analysis cancelled", "AbortError");
}

function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value!)))
    : fallback;
}

/** Parse a UCI info line, normalizing scores and mate signs to White. */
export function parseUciInfo(message: string, fen: string): EngineLine | null {
  if (!message.startsWith("info ") || !message.includes(" pv ")) return null;
  const score = message.match(/\bscore (cp|mate) (-?\d+)/);
  const depth = message.match(/\bdepth (\d+)/);
  const pv = message
    .split(" pv ")[1]
    ?.trim()
    .split(/\s+/)
    .filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
  if (
    !score ||
    !depth ||
    !pv?.length ||
    /\b(?:upperbound|lowerbound)\b/.test(message)
  )
    return null;
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  const raw = Number(score[2]) * sign || 0;
  return {
    multipv: Number(message.match(/\bmultipv (\d+)/)?.[1] ?? 1),
    score:
      score[1] === "mate" ? (raw === 0 ? -sign : Math.sign(raw)) * 10_000 : raw,
    ...(score[1] === "mate" ? { mate: raw } : {}),
    depth: Number(depth[1]),
    pv,
  };
}

/**
 * A serialized, entirely on-device UCI client. Calls queue in order. cancel()
 * rejects queued/active requests with AbortError and safely drains Stockfish's
 * stop response before another position is searched.
 */
export class LocalEngine {
  private static workers = new Set<LocalEngine>();
  status: EngineStatus = "idle";
  engineName = "Stockfish 17.1 Lite";
  private settings: LocalEngineOptions;
  private worker: EngineWorker | null = null;
  private fallbackWorker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private initializationTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private preferFallback = false;
  private active: Job | null = null;
  private queue: Job[] = [];
  private serial = 0;

  constructor(settings: LocalEngineOptions = {}) {
    const threaded =
      settings.mode === "full" &&
      globalThis.crossOriginIsolated === true &&
      typeof SharedArrayBuffer !== "undefined";
    const threads = threaded
      ? clamp(
          settings.threads,
          1,
          Math.min(4, globalThis.navigator?.hardwareConcurrency || 2),
          2,
        )
      : 1;
    this.settings = { ...settings, threads };
    if (settings.mode === "full") {
      this.engineName = `Stockfish 17.1 Full NNUE · ${threads} ${threads === 1 ? "core" : "cores"}`;
      this.settings.workerUrl ??= `${import.meta.env?.BASE_URL ?? "./"}engine/full/${threaded ? "stockfish-17.1-8e4d048.js" : "stockfish-17.1-single-a496a04.js"}`;
      this.settings.hashMb ??= 32;
      this.settings.initializationTimeout ??= 60000;
    }
  }

  async initialize(): Promise<void> {
    if (this.status === "destroyed")
      throw new Error("This engine has been closed");
    clearTimeout(this.idleTimer);
    const existing = this.ready;
    if (existing) {
      this.scheduleIdle();
      return existing;
    }
    if (this.preferFallback) {
      const pending = Promise.resolve();
      this.ready = pending;
      this.updateStatus("fallback");
      this.scheduleIdle();
      return pending;
    }
    // Keep at most two warm workers when idle ones can be released. Active or
    // queued searches are never interrupted to make room for another view.
    for (const previous of LocalEngine.workers) {
      if (LocalEngine.workers.size < 2) break;
      if (previous !== this) previous.releaseIdleResources();
    }
    this.updateStatus("loading");
    const pending = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.ready = pending;
    this.initializationTimer = setTimeout(
      () => this.useFallback(),
      this.settings.initializationTimeout ?? 12_000,
    );
    try {
      const base =
        typeof document === "undefined"
          ? "http://localhost/"
          : document.baseURI;
      const workerURL = new URL(
        this.settings.workerUrl ??
          `${import.meta.env?.BASE_URL ?? "./"}engine/stockfish.js`,
        base,
      );
      // Stockfish accepts an explicit WASM URL in the fragment. This also works
      // for capacitor:// and file://, whose URL.origin may otherwise be "null".
      if (!workerURL.hash) {
        const wasmURL = new URL(workerURL.href);
        wasmURL.pathname = wasmURL.pathname.replace(/\.js$/i, ".wasm");
        workerURL.hash = encodeURIComponent(wasmURL.href);
      }
      const url = workerURL.href;
      const worker = this.settings.workerFactory
        ? this.settings.workerFactory(url)
        : new Worker(url);
      this.worker = worker;
      LocalEngine.workers.add(this);
      worker.onmessage = (event) => {
        if (this.worker !== worker) return;
        for (const line of String(event.data).split(/\r?\n/))
          this.onMessage(line.trim());
      };
      worker.onerror = () => {
        if (this.worker === worker) this.useFallback();
      };
      worker.postMessage("uci");
    } catch {
      this.useFallback();
    }
    return pending;
  }

  analyze(fen: string, options: EngineOptions = {}): Promise<EngineResult> {
    if (this.status === "destroyed")
      return Promise.reject(new Error("This engine has been closed"));
    try {
      validatedPosition(fen);
    } catch (error) {
      return Promise.reject(
        new Error(
          `Cannot analyze an invalid chess position. ${error instanceof Error ? error.message : ""}`,
        ),
      );
    }
    const normalized = {
      depth: clamp(options.depth, 1, 30, 18),
      movetime: clamp(options.movetime, 50, 30_000, 900),
      multiPV: clamp(options.multiPV, 1, 5, 1),
      skill: clamp(options.skill, 0, 20, 20),
    };
    const result = new Promise<EngineResult>((resolve, reject) => {
      this.queue.push({
        id: ++this.serial,
        fen,
        options: normalized,
        resolve,
        reject,
        lines: new Map(),
        aborted: false,
      });
    });
    this.initialize()
      .then(() => this.pump())
      .catch((error) => this.rejectQueued(error));
    return result;
  }

  cancel(): void {
    this.rejectQueued(abortedError());
    const job = this.active;
    if (!job || job.aborted) {
      this.scheduleIdle();
      return;
    }
    job.aborted = true;
    job.reject(abortedError());
    clearTimeout(job.watchdog);
    if (this.status === "fallback") {
      this.fallbackWorker?.terminate();
      this.fallbackWorker = null;
      this.active = null;
      LocalEngine.workers.delete(this);
      this.scheduleIdle();
    } else {
      try {
        this.worker?.postMessage("stop");
      } catch {
        this.useFallback();
        return;
      }
      // A malfunctioning worker must never leave the next analysis stuck.
      job.watchdog = setTimeout(() => this.useFallback(), 2000);
    }
  }

  destroy(): void {
    if (this.status === "destroyed") return;
    this.cancel();
    clearTimeout(this.active?.watchdog);
    clearTimeout(this.initializationTimer);
    clearTimeout(this.idleTimer);
    this.dropWorkers();
    this.active = null;
    this.readyReject?.(abortedError());
    this.readyResolve = null;
    this.readyReject = null;
    this.ready = null;
    this.updateStatus("destroyed");
  }

  private dropWorkers(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    if (this.fallbackWorker) {
      this.fallbackWorker.onmessage = null;
      this.fallbackWorker.onerror = null;
      this.fallbackWorker.terminate();
      this.fallbackWorker = null;
    }
    LocalEngine.workers.delete(this);
  }

  private releaseIdleResources(): boolean {
    if (
      this.active ||
      this.queue.length ||
      !["ready", "fallback"].includes(this.status)
    )
      return false;
    clearTimeout(this.idleTimer);
    this.dropWorkers();
    this.ready = null;
    this.updateStatus("idle");
    return true;
  }

  private scheduleIdle(): void {
    clearTimeout(this.idleTimer);
    if (
      this.active ||
      this.queue.length ||
      !["ready", "fallback"].includes(this.status)
    )
      return;
    if (LocalEngine.workers.size > 2) {
      this.releaseIdleResources();
      return;
    }
    const delay = clamp(this.settings.idleTimeoutMs, 0, 300_000, 15_000);
    if (delay)
      this.idleTimer = setTimeout(() => this.releaseIdleResources(), delay);
  }

  private updateStatus(status: EngineStatus): void {
    this.status = status;
    this.settings.onStatus?.(status, this.engineName);
  }

  private rejectQueued(error: Error): void {
    for (const job of this.queue.splice(0)) job.reject(error);
  }

  private useFallback(): void {
    if (this.status === "destroyed" || this.status === "fallback") return;
    clearTimeout(this.initializationTimer);
    this.dropWorkers();
    const previous = this.active;
    clearTimeout(previous?.watchdog);
    this.active = null;
    if (previous && !previous.aborted) this.queue.unshift(previous);
    this.preferFallback = true;
    this.engineName = "Knightfall Lite";
    this.updateStatus("fallback");
    this.readyResolve?.();
    this.readyResolve = null;
    this.readyReject = null;
    this.pump();
  }

  private onMessage(message: string): void {
    if (this.status === "destroyed" || this.status === "fallback") return;
    if (message === "uciok") {
      this.worker?.postMessage(
        `setoption name Hash value ${clamp(this.settings.hashMb, 4, 64, 16)}`,
      );
      this.worker?.postMessage(
        `setoption name Threads value ${this.settings.threads || 1}`,
      );
      this.worker?.postMessage("isready");
      return;
    }
    if (message === "readyok" && this.status === "loading") {
      clearTimeout(this.initializationTimer);
      this.updateStatus("ready");
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      this.pump();
      return;
    }
    const job = this.active;
    if (!job) return;
    if (message.startsWith("info ") && !job.aborted) {
      const line = parseUciInfo(message, job.fen);
      if (line) {
        const prior = job.lines.get(line.multipv);
        if (!prior || prior.depth <= line.depth)
          job.lines.set(line.multipv, line);
        this.settings.onInfo?.(line);
      }
    } else if (message.startsWith("bestmove ")) {
      clearTimeout(job.watchdog);
      this.active = null;
      if (!job.aborted) {
        const rawMove = message.split(/\s+/)[1];
        const game = new Chess(job.fen);
        const valid = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(rawMove);
        let bestMove: string | null = valid ? rawMove : null;
        if (bestMove) {
          try {
            game.move({
              from: bestMove.slice(0, 2),
              to: bestMove.slice(2, 4),
              promotion: bestMove[4],
            });
          } catch {
            bestMove = null;
          }
        }
        const lines = [...job.lines.values()].sort(
          (a, b) => a.multipv - b.multipv,
        );
        if (!bestMove && !new Chess(job.fen).isGameOver()) {
          // Never send an illegal or missing engine move to the board.
          this.queue.unshift(job);
          this.useFallback();
          return;
        }
        const first = lines[0];
        const start = new Chess(job.fen);
        const isMate = start.isCheckmate();
        job.resolve({
          bestMove,
          score:
            first?.score ??
            (isMate ? (start.turn() === "w" ? -10_000 : 10_000) : 0),
          ...(first?.mate !== undefined
            ? { mate: first.mate }
            : isMate
              ? { mate: 0 }
              : {}),
          lines,
          depth: first?.depth ?? 0,
          engine: this.engineName,
        });
      }
      this.pump();
    }
  }

  private pump(): void {
    if (this.active || !["ready", "fallback"].includes(this.status)) return;
    if (!this.queue.length) {
      this.scheduleIdle();
      return;
    }
    clearTimeout(this.idleTimer);
    const job = this.queue.shift()!;
    this.active = job;
    const position = new Chess(job.fen);
    if (position.isGameOver()) {
      const mate = position.isCheckmate();
      this.active = null;
      job.resolve({
        bestMove: null,
        score: mate ? (position.turn() === "w" ? -10_000 : 10_000) : 0,
        ...(mate ? { mate: 0 } : {}),
        lines: [],
        depth: 0,
        engine: this.engineName,
      });
      queueMicrotask(() => this.pump());
      return;
    }
    if (this.status === "fallback") {
      this.runFallback(job);
      return;
    }
    const send = (message: string) => this.worker?.postMessage(message);
    send(`setoption name MultiPV value ${job.options.multiPV}`);
    send(`setoption name Skill Level value ${job.options.skill}`);
    send(`position fen ${job.fen}`);
    send(`go depth ${job.options.depth} movetime ${job.options.movetime}`);
    job.watchdog = setTimeout(
      () => this.useFallback(),
      (job.options.movetime ?? 900) + 10_000,
    );
  }

  private runFallback(job: Job): void {
    const finish = (result?: EngineResult, error?: Error) => {
      if (this.active?.id !== job.id) return;
      clearTimeout(job.watchdog);
      this.active = null;
      if (!job.aborted) {
        if (error) job.reject(error);
        else if (result) job.resolve(result);
      }
      this.pump();
    };
    try {
      if (typeof Worker === "undefined")
        throw new Error("Web Workers unavailable");
      this.fallbackWorker ??= new Worker(
        new URL("./engine-fallback.worker.ts", import.meta.url),
        { type: "module" },
      );
      LocalEngine.workers.add(this);
      this.fallbackWorker.onmessage = (event) => {
        if (event.data.id !== job.id) return;
        finish(
          event.data.result,
          event.data.error ? new Error(event.data.error) : undefined,
        );
      };
      this.fallbackWorker.onerror = () => {
        this.fallbackWorker?.terminate();
        this.fallbackWorker = null;
        LocalEngine.workers.delete(this);
        finish(
          undefined,
          new Error(
            "The local analysis worker could not start. Reload and try again.",
          ),
        );
      };
      this.fallbackWorker.postMessage({
        id: job.id,
        fen: job.fen,
        options: job.options,
      });
      job.watchdog = setTimeout(
        () => {
          this.fallbackWorker?.terminate();
          this.fallbackWorker = null;
          LocalEngine.workers.delete(this);
          finish(
            undefined,
            new Error("The local engine timed out. Try a shorter analysis."),
          );
        },
        (job.options.movetime ?? 900) + 5000,
      );
    } catch {
      // Older runtimes still get legal local play, with a bounded main-thread search.
      setTimeout(() => {
        if (this.active?.id !== job.id || job.aborted) return;
        try {
          finish(
            searchPosition(job.fen, {
              ...job.options,
              depth: Math.min(3, job.options.depth ?? 3),
              movetime: Math.min(300, job.options.movetime ?? 300),
            }),
          );
        } catch (error) {
          finish(
            undefined,
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }, 0);
    }
  }
}
