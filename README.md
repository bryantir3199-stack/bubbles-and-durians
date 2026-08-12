# Bubbles & Durians (3D)

A web-based **3D** shooting gallery built with **Three.js**, **WebGL**, **TypeScript**, and **Vite**. Shoot free-roaming durians in front of a castle stage, dodge bubbles, manage a 7-round magazine, and climb the online leaderboards.

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # preview production build
```

## Controls

| Input | Action |
|-------|--------|
| Mouse / touch | Aim & shoot (raycast) |
| `R`, `Space`, or **RELOAD** button | Reload (7 ammo) |

## Game rules

| Target | Hits | Score | Notes |
|--------|------|-------|-------|
| Durian | 1 | +100 | Endless: escape = −1 life |
| Gold durian | 4 | +700 | Endless: escape = −1 life |
| Bubble | 1 | −1000 | Endless: also −1 life when shot |
| Heart | 1 | — | Endless only; +1 life (max 5) |

**Endless** — 3 starting lives; game ends at 0 lives. Spawn rate stays at the normal cadence. A top-of-screen meter fills from points earned; every 10,000 points triggers a 15s **Frenzy** (3.5× spawn rate, bubble spawns −50%, durian/gold bases 250 instead of 100, sunset sky / orange grass, pulsing yellow screen border). The meter resets to 0 when Frenzy starts and does not fill during Frenzy.  
**Timed** — 3 minutes; no lives system; bubbles only subtract score; no escape penalty; no hearts.

## Online leaderboards (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy **Project URL** and **anon public** key from **Settings → API**.
4. Create `.env` from the example:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

5. Restart `npm run dev`.

Without `.env` keys, the game still runs; score submit/leaderboard stay offline.

## Assets

- `public/assets/bubble.glb`, `durian.glb` — hopping targets
- `public/assets/gold-durian.png` — gold target sprite
- `public/assets/logo.png` — title logo
- `public/assets/castle/castle.glb` — castle stage (castle4; embedded textures; includes `baked_door_l` / `baked_door_r`, spawn empties `sp1`…, and path empties `path1`…)

## Project layout

```
src/
  main.ts
  core/Game.ts, types.ts
  config/gameConfig.ts
  world/CastleStage.ts, ModelCache.ts
  scenes/          Boot, Title, ModeSelect, Play, GameOver, Leaderboard
  entities/Target.ts
  systems/Ammo.ts, Spawner.ts
  ui/HUD.ts, dom.ts
  services/leaderboard.ts
public/assets/
supabase/schema.sql
```

## License

Assets and code for personal / project use.
