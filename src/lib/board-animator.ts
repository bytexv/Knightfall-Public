import { Chess, type Color, type Square } from "chess.js";
import {
  getBoardTransition,
  squarePoint,
  type BoardPiece,
} from "./board-motion";

type Point = { x: number; y: number };
type Visual = {
  node: HTMLDivElement;
  animations: Animation[];
  hidden: HTMLImageElement | null;
  piece: BoardPiece;
};
type Drag = Visual & { from: string; point: Point };
const samePiece = (a?: BoardPiece | null, b?: BoardPiece | null) =>
  a?.color === b?.color && a?.type === b?.type;
const DURATION = 190;
const EASING = "cubic-bezier(.22,.68,.15,1)";

/** A visual-only layer: the accessible squares and legal game state update immediately. */
export class BoardAnimator {
  private fen = "";
  private orientation: Color = "w";
  private moving = new Map<string, Visual>();
  private fading = new Set<Visual>();
  private drag: Drag | null = null;
  private drop: { from: string; to: string; point: Point } | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private media: MediaQueryList | undefined;

  constructor(
    private board: HTMLElement,
    private layer: HTMLElement,
    private pieceDirectory = "pieces",
  ) {
    this.media = board.ownerDocument.defaultView?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    this.media?.addEventListener?.("change", this.onMotionPreference);
  }

  private onMotionPreference = () => {
    if (this.media?.matches) this.clear();
  };

  private image(piece: BoardPiece) {
    const image = this.board.ownerDocument.createElement("img");
    image.src = `./${this.pieceDirectory}/${piece.color}${piece.type.toUpperCase()}.svg`;
    image.alt = "";
    image.draggable = false;
    image.className = "chess-piece";
    return image;
  }

  private makeVisual(piece: BoardPiece, point: Point, square?: string): Visual {
    const node = this.board.ownerDocument.createElement("div");
    node.className = "board-motion-piece";
    node.style.left = `${point.x * 12.5}%`;
    node.style.top = `${point.y * 12.5}%`;
    if (square) node.dataset.motionSquare = square;
    node.append(this.image(piece));
    this.layer.append(node);
    const hidden = square
      ? this.board.querySelector<HTMLImageElement>(
          `[data-square="${square}"] > .chess-piece`,
        )
      : null;
    if (hidden) hidden.style.visibility = "hidden";
    return { node, animations: [], hidden, piece };
  }

  private remove(visual: Visual) {
    for (const animation of visual.animations) {
      animation.onfinish = null;
      animation.cancel();
    }
    if (visual.hidden) visual.hidden.style.removeProperty("visibility");
    visual.node.remove();
  }

  private currentPoint(visual: Visual, fallback: Point): Point {
    const boardRect = this.board.getBoundingClientRect();
    const rect = visual.node.getBoundingClientRect();
    return boardRect.width && boardRect.height && rect.width
      ? {
          x: ((rect.left - boardRect.left) / boardRect.width) * 8,
          y: ((rect.top - boardRect.top) / boardRect.height) * 8,
        }
      : fallback;
  }

  private travel(
    square: string,
    from: Point,
    before: BoardPiece,
    after: BoardPiece,
    duration = DURATION,
  ) {
    const to = squarePoint(square, this.orientation);
    const visual = this.makeVisual(before, to, square);
    visual.node.classList.add("is-travelling");
    this.moving.set(square, visual);
    const animation = visual.node.animate(
      [
        {
          transform: `translate(${(from.x - to.x) * 100}%, ${(from.y - to.y) * 100}%)`,
        },
        { transform: "translate(0%, 0%)" },
      ],
      { duration, easing: EASING },
    );
    visual.animations.push(animation);
    visual.piece = after;
    if (!samePiece(before, after)) {
      const oldImage = visual.node.firstElementChild as HTMLImageElement;
      const newImage = this.image(after);
      visual.node.append(newImage);
      visual.animations.push(
        oldImage.animate(
          [
            { opacity: 1, offset: 0 },
            { opacity: 1, offset: 0.4 },
            { opacity: 0, offset: 1 },
          ],
          { duration, fill: "forwards" },
        ),
      );
      visual.animations.push(
        newImage.animate(
          [
            { opacity: 0, offset: 0 },
            { opacity: 0, offset: 0.3 },
            { opacity: 1, offset: 1 },
          ],
          { duration, fill: "forwards" },
        ),
      );
    }
    animation.onfinish = () => {
      if (this.moving.get(square) !== visual) return;
      this.moving.delete(square);
      this.remove(visual);
    };
  }

  private fade(
    square: string,
    piece: BoardPiece,
    entering: boolean,
    point?: Point,
  ) {
    const visual = this.makeVisual(
      piece,
      point || squarePoint(square, this.orientation),
      entering ? square : undefined,
    );
    visual.node.classList.add("is-capture");
    this.fading.add(visual);
    const animation = visual.node.animate(
      [{ opacity: entering ? 0 : 1 }, { opacity: entering ? 1 : 0 }],
      { duration: 130, easing: "ease-out" },
    );
    visual.animations.push(animation);
    animation.onfinish = () => {
      if (!this.fading.delete(visual)) return;
      this.remove(visual);
    };
  }

  sync(fen: string, orientation: Color) {
    if (fen === this.fen && orientation === this.orientation) return;
    const previous = this.fen;
    const changedOrientation = orientation !== this.orientation;
    const origins = new Map<string, { point: Point; piece: BoardPiece }>();
    if (!changedOrientation)
      for (const [square, visual] of this.moving) {
        origins.set(square, {
          point: this.currentPoint(visual, squarePoint(square, orientation)),
          piece: visual.piece,
        });
      }
    const drop = this.drop;
    this.clear();
    this.fen = fen;
    this.orientation = orientation;
    if (
      !previous ||
      changedOrientation ||
      this.media?.matches ||
      typeof this.layer.animate !== "function"
    )
      return;
    const transition = getBoardTransition(previous, fen);
    if (transition.kind === "replace") return;
    const current = new Chess(fen);
    try {
      for (const motion of transition.moves) {
        const point =
          drop?.from === motion.from && drop.to === motion.to
            ? drop.point
            : origins.get(motion.from)?.point ||
              squarePoint(motion.from, orientation);
        this.travel(motion.to, point, motion.before, motion.after);
      }
      for (const removed of transition.removed)
        this.fade(
          removed.square,
          removed.piece,
          false,
          origins.get(removed.square)?.point,
        );
      for (const added of transition.added)
        this.fade(added.square, added.piece, true);
      // A second move may arrive before the first piece settles (fast replay or bot).
      for (const [square, origin] of origins) {
        if (
          !this.moving.has(square) &&
          samePiece(current.get(square as Square), origin.piece)
        )
          this.travel(square, origin.point, origin.piece, origin.piece);
      }
    } catch {
      // Animation capability varies across embedded WebViews; legality never depends on it.
      this.clear();
    }
  }

  moveDrag(from: string, piece: BoardPiece, clientX: number, clientY: number) {
    const rect = this.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {
      x: ((clientX - rect.left) / rect.width) * 8 - 0.5,
      y: ((clientY - rect.top) / rect.height) * 8 - 0.5,
    };
    if (!this.drag) {
      const moving = this.moving.get(from);
      if (moving) {
        this.moving.delete(from);
        this.remove(moving);
      }
      this.drag = { ...this.makeVisual(piece, point, from), from, point };
      this.drag.node.classList.add("is-dragging");
    }
    this.drag.point = point;
    this.drag.node.style.left = `${point.x * 12.5}%`;
    this.drag.node.style.top = `${point.y * 12.5}%`;
  }

  releaseDrag(to: string | null, accepted: boolean, promotion: boolean) {
    if (!this.drag) return;
    const drag = this.drag;
    if (accepted && to && !promotion) {
      this.drop = { from: drag.from, to, point: drag.point };
      // Keep the dropped piece in place until an authoritative LAN update arrives.
      this.dropTimer = setTimeout(() => this.cancelDrag(), 700);
      return;
    }
    this.drag = null;
    this.remove(drag);
    if (
      !promotion &&
      !this.media?.matches &&
      typeof this.layer.animate === "function"
    ) {
      try {
        this.travel(drag.from, drag.point, drag.piece, drag.piece, 150);
      } catch {
        this.clear();
      }
    }
  }

  cancelDrag() {
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = null;
    this.drop = null;
    if (this.drag) this.remove(this.drag);
    this.drag = null;
  }

  clear() {
    for (const visual of this.moving.values()) this.remove(visual);
    for (const visual of this.fading) this.remove(visual);
    this.moving.clear();
    this.fading.clear();
    this.cancelDrag();
  }

  destroy() {
    this.clear();
    this.media?.removeEventListener?.("change", this.onMotionPreference);
  }
}
