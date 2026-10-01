# India Property Tycoon

A real-time multiplayer property-trading board game with an original India-themed 56-space board
(35 cities in 12 colour groups, 5 transport hubs, 3 utilities, taxes, event cards, jail, rest stop).
React + TypeScript + Vite + Tailwind on the front, Node + Socket.IO on the back, with an
**authoritative, UI-independent game engine** and optional PostgreSQL persistence.

## Quick start

```bash
npm install
npm run dev          # server on :3001, client on http://localhost:5173
```

Production build (server also serves the built client):

```bash
npm run build
npm start            # http://localhost:3001
```

Docker (app + PostgreSQL so rooms survive restarts):

```bash
docker compose up --build   # http://localhost:3001
```

Open the game in two or more browser windows: create a room in one, join with the code
(e.g. `INDIA-7X42`) in the others.

```bash
npm test             # 22 engine tests + an end-to-end multiplayer smoke test (real server, 3 socket clients)
npm run typecheck
```

Environment variables are in `.env.example` (`PORT`, `DATABASE_URL`, `CORS_ORIGINS`).
Without `DATABASE_URL` rooms live in memory; with it, snapshots are written to a `rooms` table
and restored on boot (players show as offline until they reconnect).

## Architecture

```
React client ──Socket.IO──> server/src/index.ts (sockets, rate limit, broadcast)
                                 │
                            rooms.ts  (room codes, sessions, reconnect, auction clock, persistence)
                                 │
                       engine/engine.ts  (pure rules, no I/O, injectable RNG + clock)
                                 │
                       persistence.ts (Postgres JSONB snapshots, or memory)
```

* `shared/types.ts` – types shared by client and server.
* `server/src/engine/boardData.ts` – the board, groups, prices, rent ladders (data-driven).
* `server/src/engine/cards.ts` – 16 Khazana + 17 Bhagya cards.
* `server/src/engine/engine.ts` – `applyAction()` is the only entry point; it validates turn order,
  phase, ownership and funds for every action. Exposes `rollDice`, `movePlayer`, `buyProperty`,
  `calculateRent`, `build`, `mortgage`, trades, auctions, `drawCard`, `sendToJail`,
  `declareBankrupt`, `endTurn`, winner check (all internal functions, tested via `applyAction`).
* `server/src/engine/view.ts` – builds each player's view. Deck order and other players' trades never leave the server.
  It also includes `legal` actions, so the UI only offers moves the server would accept.

**Server authority.** Dice come from `crypto.randomBytes`. The client only sends intents
(`roll`, `buy`, `build`, `proposeTrade`…); money, positions, rent, ownership, turns, trades,
bankruptcy and the winner are computed solely on the server. Session tokens (random, 192-bit)
identify players; sockets are rate-limited.

**Reconnection.** The client stores `{roomCode, sessionToken}` in `localStorage` and calls
`room:resume` on every (re)connect. The server keeps the player's state, marks them offline/online,
and sends the full current state. Nothing restarts when someone drops.

## Rules implemented

Roll two dice, doubles give another roll, three doubles go to jail. Jail: pay ₹500, roll doubles,
use a Get Out of Jail Free card, or pay automatically after 3 failed rolls. GO salary when passing.
Buy / decline → live auction (25 s, each bid extends to at least 10 s; players can drop out).
Rent: base (×2 with full colour set), 1–4 houses, hotel; transport rent by hubs owned
(₹250 → ₹3,500); utilities 40× / 100× / 150× dice. Even building, house/hotel supply (60/24),
selling at half price, mortgage (50%) and unmortgage (+10%). Taxes. Cards: money, movement,
nearest hub/utility, jail, jail-free, collect-from-all, repairs.
Debt: if you cannot pay but could raise the cash, you must mortgage/sell and then pay (it settles
automatically once you have enough) or declare bankruptcy; if your total assets cannot cover it you go
bankrupt immediately. Creditor inherits assets (10% fee on mortgaged properties); bank debts return
properties to the bank. Last solvent player wins.

**Trading.** Propose cash, properties and jail cards both ways. Each party must accept the *same* terms;
proposing counts as the proposer's acceptance, any counter-offer resets the other side, and the server
re-validates everything at execution (ownership, funds, no buildings in the group, mortgage transfer
fees) so a tampered client cannot conjure assets. Stale trades are pruned automatically.

**Economy** (classic ratios ×10): start ₹15,000, GO ₹2,000, jail ₹500, cities ₹600 → ₹5,000.

## Known simplifications

* Properties returned to the bank after a bankruptcy go back on sale (landed-on) rather than being auctioned immediately.
* "Collect from each player" cards take whatever a player can pay, up to the amount, instead of opening debts for them.
* Redis is not used; a single Node process holds live rooms (Postgres is only for snapshots). Scaling out would need sticky sessions or a Redis adapter.
* Tokens are emoji in coloured rings, so they follow your OS emoji font (the lotus needs a recent OS).
* Web fonts (Google Fonts) load from the network, with system-font fallbacks when offline.
