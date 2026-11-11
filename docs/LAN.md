# Same-Wi-Fi play

Knightfall's Wi-Fi games run on one computer in your local network. The host serves the web app, validates every move, and owns both clocks. No external matchmaking or relay service is required.

## Windows app

1. Connect both devices to the same Wi-Fi network.
2. Open Knightfall on Windows, open **Play with friends**, and choose the **Create a room** tab.
3. If Windows asks, allow Knightfall through the firewall on your **private** network.
4. Choose a time control, name, and side, then select **Create Wi-Fi room**.
5. Share the displayed local address, such as `http://192.168.1.20:8787`, and the six-character room code.
6. On the second device, open that address in its browser, choose **Join a room**, and enter the code. The Android app can also join by entering the address and code directly.

Keep the host computer awake and the app open until the game ends. `127.0.0.1` and `localhost` identify the current device; share the address beginning with your host's LAN IP instead.

## Run from source

Node.js 24 LTS is recommended; use at least Node.js 22.15.

```sh
npm ci
node scripts/prepare-engine.mjs
npm run build
npm run lan
```

The terminal prints the computer's local addresses. The default port is `8787`. To choose another port, set the `KNIGHTFALL_PORT` environment variable before running the command. Run only one host on a given port.

The local server serves the built app in `dist/`. Rebuild after changing frontend source. Internet access is needed for the initial dependency installation; ongoing LAN play uses local files and local network connections.

## Game behavior

- The host validates turns and moves, including castling, en passant, and promotion. A client cannot change the board or game result by sending its own FEN.
- Clocks start when the second player joins. Increment is added after each legal move. A disconnected player's clock continues running.
- The app automatically attempts to reconnect after a dropped connection. Reloading the page offers **Resume saved seat** when the browser still has that room's session token. Use the same browser tab and host address.
- Resignation, draw offers, draw acceptance or decline, and rematch requests are supported. Both players must agree to a rematch; colors swap.
- Leaving an active room ends that game as a loss. Closing a connection preserves the seat to permit reconnection.
- Rooms and games are held in the host's memory. Closing the host loses them. Export the PGN before shutting down if you want to keep the game.
- The server applies common automatic draws (stalemate, insufficient material, threefold repetition, and fifty-move rule). This local casual format does not use tournament draw-claim procedures.

## If devices cannot connect

Check the host address, that Knightfall is still open, and that both devices are on the same network. Guest Wi-Fi, school networks, and access-point device isolation can prevent devices from contacting each other. A firewall must allow the chosen TCP port on the host. VPN routes can also interfere with local access.

The hosted HTTPS version cannot open an insecure `ws://` connection directly to a Wi-Fi host in a browser. Use **Open local host** to open the local HTTP app, then join there. This browser restriction does not affect the packaged Android app's direct local join flow.

Local games use HTTP/WebSocket transport suitable for your trusted local network; they are not an internet-facing chess service. Do not configure router port forwarding for this host.

## Protocol and implementation

`server/index.mjs` exports `startLanServer({port, host, staticDir})`. It returns `{port, urls, close()}`; port `0` selects an available port and `close()` is idempotent. `/health` identifies a Knightfall host, `/api/lan-info` reports its local addresses, and `/ws` carries room commands.

Commands include `create`, `join`, `move`, `sync`, `offer_draw`, `accept_draw`, `decline_draw`, `resign`, `rematch`, and `leave`. Clients receive snapshots with the FEN, PGN, history, player connection status, clocks, draw offer, and result. Each game has a stable game ID and a round number; rematches receive a new ID so saved games remain separate. Seat tokens are generated from 32 random bytes and never included in other players' snapshots.

Message sizes, request frequency, client counts, and room counts are bounded. The server checks browser origins and local Host headers, rejects path traversal and symlinks outside the static root, and does not execute client-supplied code. The same-origin check permits native app origins on `localhost`. The browser client verifies the host protocol and validates incoming board snapshots before rendering them.

Validation lives in `tests/lan.test.mjs` and `tests/lan-client.test.mjs` and uses actual HTTP and WebSocket connections, including dropped-connection recovery.
