import { validateFen } from "chess.js";

export type LanColor = "w" | "b";
export type LanConnection =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";
export type LanSnapshot = {
  code: string;
  gameId: string;
  round: number;
  createdAt: number;
  fen: string;
  pgn: string;
  history: string[];
  turn: LanColor;
  status: "waiting" | "playing" | "finished";
  result: { winner: LanColor | null; reason: string } | null;
  lastMove: {
    from: string;
    to: string;
    promotion?: string;
    san: string;
  } | null;
  players: Record<LanColor, { name: string; connected: boolean } | null>;
  clocks: {
    w: number;
    b: number;
    increment: number;
    running: LanColor | null;
    serverNow: number;
    enabled: boolean;
  };
  timeControl: { baseSeconds: number; incrementSeconds: number };
  yourColor: LanColor | null;
  drawOffer: LanColor | null;
  rematchVotes: LanColor[];
};
export type CreateLanRoom = {
  name: string;
  color?: LanColor | "random";
  timeMinutes?: number;
  incrementSeconds?: number;
};
type Credentials = { code: string; token: string; name: string };
type EventMap = {
  snapshot: LanSnapshot;
  error: string;
  connection: LanConnection;
  left: undefined;
};

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, min = 0, max = 1e12): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const color = (value: unknown): value is LanColor =>
  value === "w" || value === "b";
const nullableColor = (value: unknown) => value === null || color(value);
const validHostUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 250) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};
const roomCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(value);

/** Validate network data before it can enter a board renderer or saved-game store. */
export function isLanSnapshot(value: unknown): value is LanSnapshot {
  if (
    !record(value) ||
    !roomCode(value.code) ||
    typeof value.gameId !== "string" ||
    !/^[a-f0-9]{24}$/.test(value.gameId)
  )
    return false;
  if (
    !finite(value.round, 1, 1000000) ||
    !Number.isInteger(value.round) ||
    !finite(value.createdAt, 1, 1e14)
  )
    return false;
  if (
    typeof value.fen !== "string" ||
    value.fen.length > 120 ||
    !validateFen(value.fen).ok ||
    !color(value.turn) ||
    value.fen.split(" ")[1] !== value.turn
  )
    return false;
  if (
    typeof value.pgn !== "string" ||
    value.pgn.length > 200000 ||
    !Array.isArray(value.history) ||
    value.history.length > 16384 ||
    !value.history.every(
      (move) => typeof move === "string" && move.length <= 32,
    )
  )
    return false;
  if (
    !["waiting", "playing", "finished"].includes(String(value.status)) ||
    !nullableColor(value.yourColor) ||
    !nullableColor(value.drawOffer)
  )
    return false;
  if (
    value.result !== null &&
    (!record(value.result) ||
      !nullableColor(value.result.winner) ||
      typeof value.result.reason !== "string" ||
      value.result.reason.length > 160)
  )
    return false;
  if ((value.status === "finished") !== (value.result !== null)) return false;
  if (
    !record(value.players) ||
    !["w", "b"].every((side) => {
      const player =
        value.players && (value.players as Record<string, unknown>)[side];
      return (
        player === null ||
        (record(player) &&
          typeof player.name === "string" &&
          player.name.length <= 24 &&
          typeof player.connected === "boolean")
      );
    })
  )
    return false;
  const clock = value.clocks,
    time = value.timeControl;
  if (
    !record(clock) ||
    !finite(clock.w, 0, 1e9) ||
    !finite(clock.b, 0, 1e9) ||
    !finite(clock.increment, 0, 60000) ||
    !finite(clock.serverNow, 1, 1e14) ||
    !nullableColor(clock.running) ||
    typeof clock.enabled !== "boolean"
  )
    return false;
  if (
    !record(time) ||
    !finite(time.baseSeconds, 0, 10800) ||
    !finite(time.incrementSeconds, 0, 60) ||
    clock.enabled !== time.baseSeconds > 0
  )
    return false;
  if ((!clock.enabled || value.status !== "playing") && clock.running !== null)
    return false;
  if (clock.running !== null && clock.running !== value.turn) return false;
  if (
    !Array.isArray(value.rematchVotes) ||
    value.rematchVotes.length > 2 ||
    !value.rematchVotes.every(color) ||
    new Set(value.rematchVotes).size !== value.rematchVotes.length
  )
    return false;
  if (
    value.lastMove !== null &&
    (!record(value.lastMove) ||
      !/^[a-h][1-8]$/.test(String(value.lastMove.from)) ||
      !/^[a-h][1-8]$/.test(String(value.lastMove.to)) ||
      typeof value.lastMove.san !== "string" ||
      value.lastMove.san.length > 32 ||
      (value.lastMove.promotion !== undefined &&
        !["q", "r", "b", "n"].includes(String(value.lastMove.promotion))))
  )
    return false;
  return true;
}

/** A small WebSocket client; legal moves, clocks and game results belong to the host. */
export class LanClient {
  readonly serverUrl: string;
  readonly socketUrl: string;
  snapshot: LanSnapshot | null = null;
  hostUrls: string[] = [];
  connection: LanConnection = "disconnected";
  private socket: WebSocket | null = null;
  private credentials: Credentials | null = null;
  private playerName = "Player";
  private intentional = false;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;
  private listeners = new Map<keyof EventMap, Set<(value: never) => void>>();

  constructor(serverUrl: string) {
    const url = new URL(
      /^[a-z]+:\/\//i.test(serverUrl) ? serverUrl : `http://${serverUrl}`,
    );
    if (
      !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        "Enter a valid local host address, such as http://192.168.1.20:8787.",
      );
    const secure = url.protocol === "https:" || url.protocol === "wss:";
    this.serverUrl = `${secure ? "https:" : "http:"}//${url.host}`;
    this.socketUrl = `${secure ? "wss:" : "ws:"}//${url.host}/ws`;
  }
  private get storageKey() {
    return `knightfall.lan.${this.serverUrl}`;
  }
  private emit<K extends keyof EventMap>(event: K, value: EventMap[K]) {
    this.listeners.get(event)?.forEach((listener) => listener(value as never));
  }
  private setConnection(value: LanConnection) {
    this.connection = value;
    this.emit("connection", value);
  }
  on<K extends keyof EventMap>(
    event: K,
    listener: (value: EventMap[K]) => void,
  ): () => void {
    const set = this.listeners.get(event) || new Set();
    set.add(listener as (value: never) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as (value: never) => void);
    };
  }
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.connection === "connected"
    )
      return Promise.resolve();
    this.intentional = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.setConnection(this.retry ? "reconnecting" : "connecting");
    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let handshake = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.socketUrl);
      } catch (error) {
        this.setConnection("disconnected");
        reject(error);
        return;
      }
      this.socket = socket;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              "The host did not respond. Check the address and Wi-Fi connection.",
            ),
          );
          socket.close();
        }
      }, 10000);
      const protocolError = (message: string) => {
        clearTimeout(timeout);
        this.intentional = true;
        if (!settled) {
          settled = true;
          reject(new Error(message));
        } else this.emit("error", message);
        socket.close(4002, "Invalid Knightfall host response");
      };
      socket.onopen = () => {
        if (this.socket !== socket || this.intentional) {
          clearTimeout(timeout);
          socket.close();
          if (!settled) {
            settled = true;
            reject(new Error("Connection cancelled."));
          }
          return;
        }
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        if (typeof event.data !== "string" || event.data.length > 1500000)
          return protocolError(
            "The host sent an invalid response. Check that this is a Knightfall host.",
          );
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return protocolError("The host sent unreadable data.");
        }
        if (!record(data))
          return protocolError("The host sent an invalid response.");
        if (data.type === "hello") {
          if (
            handshake ||
            data.service !== "knightfall-lan" ||
            data.version !== 1 ||
            !Array.isArray(data.urls)
          )
            return protocolError(
              "This address is not a compatible Knightfall host.",
            );
          handshake = true;
          this.hostUrls = data.urls.filter(validHostUrl);
          clearTimeout(timeout);
          settled = true;
          this.setConnection("connected");
          if (this.retry && this.credentials)
            this.send({ type: "join", ...this.credentials });
          this.retry = 0;
          resolve();
        } else if (!handshake)
          return protocolError(
            "This address is not a compatible Knightfall host.",
          );
        else if (data.type === "joined") {
          if (
            !roomCode(data.code) ||
            typeof data.token !== "string" ||
            !/^[a-f0-9]{64}$/.test(data.token) ||
            !color(data.color)
          )
            return protocolError("The host sent an invalid seat confirmation.");
          this.credentials = {
            code: data.code,
            token: data.token,
            name: this.playerName,
          };
          try {
            sessionStorage.setItem(
              this.storageKey,
              JSON.stringify(this.credentials),
            );
          } catch {
            /* private browsing */
          }
        } else if (data.type === "snapshot") {
          if (!isLanSnapshot(data.snapshot))
            return protocolError(
              "The host sent an invalid board state. Reconnect to a Knightfall host.",
            );
          this.snapshot = data.snapshot;
          this.emit("snapshot", this.snapshot);
        } else if (data.type === "error") {
          if (["invalid_token", "room_not_found"].includes(String(data.code))) {
            const wasResuming = !!this.credentials;
            this.forgetSaved();
            if (wasResuming) {
              this.intentional = true;
              socket.close(1000, "Room is no longer available");
            }
          }
          this.emit(
            "error",
            typeof data.message === "string"
              ? data.message.slice(0, 500)
              : "The host could not complete that action.",
          );
        } else if (data.type === "left") {
          this.snapshot = null;
          this.credentials = null;
          this.emit("left", undefined);
        }
      };
      socket.onerror = () => {
        if (!settled) {
          clearTimeout(timeout);
          settled = true;
          reject(
            new Error(
              "Cannot reach this host. Check that both devices are on the same Wi-Fi and Knightfall is open.",
            ),
          );
        }
      };
      socket.onclose = (event) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(
            new Error(
              "The connection to the host closed. Check the host address.",
            ),
          );
        }
        if (this.socket !== socket) return;
        this.socket = null;
        if (event.code === 4001) {
          this.intentional = true;
          this.emit("error", "Your seat was reopened on another connection.");
        }
        if (!this.intentional && this.credentials && this.retry < 8) {
          this.setConnection("reconnecting");
          const delay = Math.min(8000, 1000 * 2 ** this.retry++);
          this.reconnectTimer = setTimeout(() => {
            this.connect().catch(() => {});
          }, delay);
        } else {
          this.setConnection("disconnected");
          if (!this.intentional && this.credentials)
            this.emit(
              "error",
              "Connection lost. Reopen the room to resume your seat. The host’s clock continues running.",
            );
        }
      };
    }).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }
  private send(data: Record<string, unknown>): boolean {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.connection !== "connected"
    ) {
      this.emit(
        "error",
        "You are not connected to the host. Wait for reconnection.",
      );
      return false;
    }
    this.socket.send(JSON.stringify(data));
    return true;
  }
  create(options: CreateLanRoom) {
    this.playerName = options.name;
    this.send({ type: "create", ...options });
  }
  join(code: string, name: string) {
    this.playerName = name;
    this.send({ type: "join", code: code.trim().toUpperCase(), name });
  }
  savedRoom(): string | null {
    try {
      return (
        JSON.parse(sessionStorage.getItem(this.storageKey) || "null")?.code ||
        null
      );
    } catch {
      return null;
    }
  }
  resumeSaved(): boolean {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(this.storageKey) || "null",
      ) as Credentials | null;
      if (!saved?.code || !saved.token) return false;
      this.credentials = saved;
      this.playerName = saved.name;
      return this.send({ type: "join", ...saved });
    } catch {
      return false;
    }
  }
  forgetSaved() {
    const previous = this.credentials;
    this.credentials = null;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(this.storageKey) || "null",
      ) as Credentials | null;
      if (
        previous &&
        saved?.token === previous.token &&
        saved?.code === previous.code
      )
        sessionStorage.removeItem(this.storageKey);
    } catch {
      /* storage unavailable */
    }
  }
  move(from: string, to: string, promotion = "q") {
    return this.send({ type: "move", from, to, promotion });
  }
  resign() {
    return this.send({ type: "resign" });
  }
  offerDraw() {
    return this.send({ type: "offer_draw" });
  }
  acceptDraw() {
    return this.send({ type: "accept_draw" });
  }
  declineDraw() {
    return this.send({ type: "decline_draw" });
  }
  rematch() {
    return this.send({ type: "rematch" });
  }
  sync() {
    return this.send({ type: "sync" });
  }
  leave() {
    this.send({ type: "leave" });
    this.forgetSaved();
    this.snapshot = null;
  }
  disconnect() {
    this.intentional = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, "Disconnected");
    this.socket = null;
    this.setConnection("disconnected");
  }
}
