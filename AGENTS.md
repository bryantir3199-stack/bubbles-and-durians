# AGENTS.md

## Cursor Cloud specific instructions

Bubbles & Durians is a single-page browser game (Vite + TypeScript + Three.js/WebGL). There is one service to run; there is no custom backend and no local database.

### Services, lint, test, build, run

- Standard scripts live in `package.json` (`dev`, `build`, `preview`); the README documents usage.
- Run (dev): `npm run dev` serves the game at `http://localhost:5173`.
- Typecheck/build: `npm run build` runs `tsc` (typecheck) then `vite build`. There is no separate lint script and no automated test suite, so `npm run build` is the closest thing to a lint/CI check — use it to verify TypeScript passes.

### Non-obvious notes

- The Vite config sets `server.open: true`, so `npm run dev` tries to launch a browser. This is harmless in the cloud VM (the launch just fails silently); the server still serves on port 5173.
- Online leaderboards use Supabase and are OPTIONAL. Without a `.env` (see `.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), the game runs fully in offline mode — all gameplay works; only score submit/leaderboard show offline messages. No login/auth is required to play or to test core gameplay.
- WebGL gotcha for GUI testing: the game requires WebGL. In the cloud VM's headless Chrome, WebGL is not available by default. Launch Chrome with software rendering flags to test gameplay, e.g. `--use-gl=angle --use-angle=swiftshader-webgl --ignore-gpu-blocklist --disable-gpu-sandbox`.
- Gameplay controls: mouse/touch click to shoot (raycast onto 3D targets), `R` to reload the 7-round magazine. Flow: Title → PLAY → Mode Select (Endless/Timed) → Play → Game Over → (optional) submit name → Leaderboard.
