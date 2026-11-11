# Board motion

ChessBoard keeps its accessible square buttons and authoritative position current while a pointer-transparent layer animates individual pieces. Moves last 190 ms; capture fades last 130 ms. Legal input and clocks never wait for animation completion.

The transition detector accepts one legal forward or reverse move. It handles both castling pieces, captures, en passant, and promotion or underpromotion. Loading an unrelated position cuts directly to that position. A board flip clears existing motion. Rapid adjacent replay reads each moving piece's current rendered location before starting the next transition. Percentage-based positions and transforms follow board resizing.

Dragging uses pointer capture and a six-pixel movement threshold. The piece follows the pointer; accepted drops settle from that location. A short-lived pending visual allows an authoritative LAN update to arrive without snapping back first. Rejected drops return to the legal square. Pointer cancellation and unmount clear the drag. Reduced-motion preferences disable automatic travel/fades, including when the preference changes while a move is underway; direct pointer tracking still works.

## Verification

```sh
node --import tsx --test tests/board.test.mjs tests/board-motion.test.mjs tests/board-animation.test.mjs
npx electron scripts/native-board-motion.cjs --ozone-platform=headless --disable-gpu
```

The native suite bundles the current source into a temporary fixture, uses an isolated profile, and leaves `dist/` untouched. It measures actual intermediate animation frames, rapid-replay continuity, both castling pieces, captures, underpromotion, resizing, native mouse dragging/drop and an emulated reduced-motion preference. Output is written to `artifacts/qa/board-motion/`.

Before a platform release, repeat click and touch drag/drop in the integrated app on the target Windows/Android devices. Check fast replay while analysis runs, castling and underpromotion, device rotation, navigation during a move, and joining a Wi-Fi game from another device. The source fixture does not substitute for target-device testing or testing every integrated game mode.
