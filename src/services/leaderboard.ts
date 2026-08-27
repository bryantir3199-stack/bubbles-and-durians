import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameMode, RankedMode, TimedPreset } from '../config/gameConfig';
import { toRankedMode } from '../config/gameConfig';
import { validatePlayerName } from '../config/playerName';

/** Values stored in scores.mode, including pre-split timed rows. */
export type StoredScoreMode = RankedMode | 'timed';

export interface ScoreRow {
  id: string;
  player_name: string;
  score: number;
  mode: StoredScoreMode;
  created_at: string;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project') || key.includes('your-anon')) {
    return null;
  }
  client = createClient(url, key);
  return client;
}

export function isLeaderboardConfigured(): boolean {
  return getClient() !== null;
}

function isStoredScoreMode(mode: string): mode is StoredScoreMode {
  return mode === 'endless' || mode === 'timed' || mode === 'timed-short' || mode === 'timed-medium';
}

export async function fetchTopScores(mode: StoredScoreMode, limit = 10): Promise<ScoreRow[]> {
  if (!isStoredScoreMode(mode)) return [];
  const sb = getClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from('scores')
    .select('id, player_name, score, mode, created_at')
    .eq('mode', mode)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Leaderboard fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as ScoreRow[];
}

export type ModeHighScores = Record<RankedMode, ScoreRow | null>;

let modeHighScoreCache: ModeHighScores | undefined;
let modeHighScoreInflight: Promise<ModeHighScores> | null = null;

let highScoreCache: ScoreRow | null | undefined;
let highScoreInflight: Promise<ScoreRow | null> | null = null;

function pickHigherScore(a: ScoreRow | undefined, b: ScoreRow | undefined): ScoreRow | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a.score !== b.score) return a.score >= b.score ? a : b;
  return new Date(a.created_at) >= new Date(b.created_at) ? a : b;
}

/** Top score on each ranked board. */
export async function fetchModeHighScores(): Promise<ModeHighScores> {
  if (modeHighScoreCache) return modeHighScoreCache;
  if (modeHighScoreInflight) return modeHighScoreInflight;

  modeHighScoreInflight = Promise.all([
    fetchTopScores('endless', 1),
    fetchTopScores('timed-short', 1),
    fetchTopScores('timed-medium', 1),
  ])
    .then(([endless, short, medium]) => {
      modeHighScoreCache = {
        endless: endless[0] ?? null,
        'timed-short': short[0] ?? null,
        'timed-medium': medium[0] ?? null,
      };
      return modeHighScoreCache;
    })
    .finally(() => {
      modeHighScoreInflight = null;
    });

  return modeHighScoreInflight;
}

/** Overall #1 across ranked boards (plus legacy combined timed). */
export async function fetchHighScore(): Promise<ScoreRow | null> {
  if (highScoreCache !== undefined) return highScoreCache;
  if (highScoreInflight) return highScoreInflight;

  highScoreInflight = Promise.all([
    fetchModeHighScores(),
    fetchTopScores('timed', 1),
  ])
    .then(([boards, timed]) => {
      highScoreCache = [boards.endless, boards['timed-short'], boards['timed-medium'], timed[0]].reduce<
        ScoreRow | null
      >((best, row) => pickHigherScore(best ?? undefined, row ?? undefined), null);
      return highScoreCache;
    })
    .finally(() => {
      highScoreInflight = null;
    });

  return highScoreInflight;
}

export function invalidateHighScoreCache(): void {
  highScoreCache = undefined;
  modeHighScoreCache = undefined;
}

/** 1-based rank: 1 + number of strictly higher scores on that board. */
export async function fetchScoreRank(mode: RankedMode, score: number): Promise<number | null> {
  const sb = getClient();
  if (!sb) return null;

  const { count, error } = await sb
    .from('scores')
    .select('id', { count: 'exact', head: true })
    .eq('mode', mode)
    .gt('score', Math.floor(score));

  if (error || count == null) {
    console.warn('Rank fetch failed:', error?.message);
    return null;
  }
  return count + 1;
}

export async function submitScore(
  playerName: string,
  score: number,
  mode: GameMode,
  timedPreset?: TimedPreset,
): Promise<{ ok: boolean; error?: string }> {
  if (mode === 'tutorial') {
    return { ok: false, error: 'How to Play scores are not ranked' };
  }
  const ranked = toRankedMode(mode, timedPreset);
  if (!ranked) {
    return { ok: false, error: 'This mode is not ranked' };
  }
  const sb = getClient();
  if (!sb) {
    return { ok: false, error: 'Leaderboard not configured. Add Supabase keys to .env' };
  }

  const parsed = validatePlayerName(playerName);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (score < 0) return { ok: false, error: 'Invalid score' };

  const { error } = await sb.from('scores').insert({
    player_name: parsed.name,
    score: Math.floor(score),
    mode: ranked,
  });

  if (error) {
    console.warn('Score submit failed:', error.message);
    return { ok: false, error: error.message };
  }
  invalidateHighScoreCache();
  return { ok: true };
}
