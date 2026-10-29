# Echo Game: Context

**Owner:** Rickesh Mistry
**Started:** 2026-10-29
**Code lives in:** this folder (`Outputs/Echo Game/`), which is also the git repo (one commit on `main` so far).
**Repo on GitHub:** https://github.com/RickeshMistry95/echo-game (public). **Live:** https://rickeshmistry95.github.io/echo-game/ (Pages via GitHub Actions, deploys on every push to main).
**Plan doc:** https://claude.ai/artifact/X9UwQxjfxAhTM5iQ5vj51q (full design plan: rules, maps, screens, saving, controls, build phases)

## What it is
A browser game. You survive 10-second rounds. Every round you clear comes back as a ghost that replays your exact path, and touching any ghost ends the run. You are dodging your own past runs. Score is rounds survived.

## Status (2026-10-29)
- **v1 built and tested.** Everything in the plan that works locally is in: Classic, Daily (3 attempts, streak, share text), Seed codes, Practice, 3-round tutorial, stats with chart, best-run replay, settings, save export and import, keyboard, mouse and touch controls, generated sound.
- **32 unit tests pass** (maps, simulation, storage). Played through in a real browser: full runs, pause, game over, stats, tutorial, daily, seed entry, phone layout with touch, high contrast. No console errors. 60 fps with 20 ghosts.
- **Not heard:** the sound was never listened to (headless browser). Check it by ear.
- **Not built (by design):** accounts, cloud sync, online leaderboards, multiplayer. Storage goes through one async `Store` interface so a server adapter can be added without touching game code.

## Run it
```
cd "Outputs/Echo Game"
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```
Run `npm install` from Windows, not from a Linux shell, so `node_modules` matches your machine.

## Next steps for Rickesh
1. Connect GitHub to Claude (claude.ai Settings, Connectors), then have a session create the repo and push. Or run `gh repo create echo-game --public --source=. --push` in this folder. Then set Pages to deploy from GitHub Actions once so the workflow can publish the game.
2. Playtest 10 or so runs. This is the checkpoint from the plan: does "one more try" happen? Tune `src/core/constants.ts` (round length, speed, coin rules, shield).
3. Open questions from the plan: is 10 seconds the right round length (try 8 and 12), does a missed coin end the run or cost one of 3 lives, 1 or 3 daily attempts.
4. Listen to the sound and adjust `src/audio/synth.ts` if needed.

## Key decisions
- Plain TypeScript + Vite + canvas 2D. No game engine, no art or audio files.
- The simulation is deterministic (fixed 60 ticks per second, quantised inputs, seeded RNG, no clock). Ghosts are exact replays and scores can be verified later.
- Maps come from one 30 bit seed plus a tier (Open, Standard, Tight). Fairness checks guarantee every open area is connected and every gap is at least 3 player widths.
- Save data is `localStorage` key `echo.save.v1`, versioned and sanitised on load.
- Built ad hoc rather than with the Autonomous Build Kit, because the build ran from a design plan written in chat. `docs/` has no Requirements, BuildPlaybook or BuildState files yet. Add them before any large new build phase.

## Files
- `Archive/EchoGame_ProjectSnapshot_v1.zip`: the zip the first build was delivered as (ignored by git).
- `README.md`: how to play, scripts, structure.
