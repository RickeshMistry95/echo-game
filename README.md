# Echo

Survive 10-second rounds. Every round you clear comes back as a ghost that replays your exact path, and touching any ghost ends the run. You are not dodging enemies. You are dodging yourself.

Plain TypeScript, the HTML canvas and Vite. No game engine, no server, no art or audio files (everything is drawn and synthesised in code).

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

| Device | Control |
| --- | --- |
| Keyboard | WASD or arrow keys |
| Mouse | The dot moves toward the cursor |
| Touch | Drag anywhere (relative joystick). Two-finger tap pauses |
| Any | Esc or P pauses. R retries from the game over screen |

**Rules**

- Each round lasts 10 seconds. Grab the amber coin before time runs out, or the run ends.
- The path you took becomes a ghost in every later round. Touch one and the run ends.
- Each round starts where the last one ended, with a short spawn shield.
- Score: 100 per round cleared, up to 50 for a fast coin, 10 per near miss (5 per round). The headline number is **rounds survived**.

**Modes**

- **Classic**: a new seeded map each run, with Open, Standard and Tight tiers.
- **Daily**: the same map for everyone on a given local date, 3 attempts, your best counts. Share result text and a day streak.
- **Seed**: type a map code such as `2-K7QX24` to replay a map.
- **Practice**: ghosts cannot hurt you and nothing is saved.
- A 3-round tutorial opens on first launch.

## Scripts

```bash
npm run dev         # dev server
npm run build       # type check, then production build into dist/
npm run preview     # serve the production build
npm test            # unit tests (Vitest)
npm run typecheck
```

## How it is built

```
src/
  main.ts            boot
  game.ts            game controller: phases, fixed timestep loop, HUD, rendering hand-off
  core/
    sim.ts           deterministic simulation (no clock, no Math.random)
    constants.ts     every gameplay number in one place
    rng.ts           seeded RNG (mulberry32) and hashing
    daily.ts         daily map, puzzle number, share text
  map/
    generate.ts      seeded arena + obstacle generation, fairness checks, coin list
    geometry.ts      signed distance shapes, wall collision
    seedcode.ts      map codes like 2-K7QX24
  render/            canvas drawing and effects
  input/             keyboard, mouse and touch
  audio/synth.ts     Web Audio music pad and sound effects
  storage/           save schema, store, storage adapters
  ui/                router and one file per screen
tests/               map, simulation and storage tests
```

- **Deterministic simulation.** `step(state, ix, iy)` advances exactly 1/60 s and quantises input to a byte. Replaying the stored inputs reproduces every position, which is what makes ghosts exact and leaves the door open to server-side score verification.
- **Fixed timestep.** Rendering interpolates between ticks, so 60 Hz and 120 Hz screens play at the same speed. The arena is always 600 x 600 logical units.
- **Fair random maps.** A map is built from one 30-bit seed. The generator rasterises the arena, requires every open cell to be connected and every gap to be at least 3 player widths wide, and rerolls obstacles (up to 20 times) until both hold.
- **Saving.** All data goes through `Store` (`src/storage/store.ts`), which talks to a `StorageAdapter`. The shipped adapter uses `localStorage`, guarded so blocked storage never crashes the game. Every `Store` method is async, so a server adapter can replace the local one without touching game code. Saves are versioned (`echo.save.v1`) and sanitised on load, and Settings has export and import.

## Deploy

`.github/workflows/pages.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. In the repository settings, set Pages to deploy from **GitHub Actions** once. The build uses relative paths, so it also works from any static host.

## Not built yet

Accounts, cloud sync, online leaderboards and multiplayer. The storage layer and the deterministic simulation are set up so they can be added later.
