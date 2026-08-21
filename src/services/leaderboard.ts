import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameMode, RankedMode } from '../config/gameConfig';

export interface ScoreRow {
  id: string;
  player_name: string;
  score: number;
  mode: RankedMode;
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

function isRankedMode(mode: GameMode): mode is RankedMode {
  return mode === 'endless' || mode === 'timed';
}

export async function fetchTopScores(mode: GameMode, limit = 10): Promise<ScoreRow[]> {
  if (!isRankedMode(mode)) return [];
  const sb = getClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from('scores')
    .select('id, player_name, score, mode, created_at')
    .eq('mode', mode)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Leaderboard fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as ScoreRow[];
}

let highScoreCache: ScoreRow | null | undefined;
let highScoreInflight: Promise<ScoreRow | null> | null = null;

function pickHigherScore(a: ScoreRow | undefined, b: ScoreRow | undefined): ScoreRow | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a.score !== b.score) return a.score >= b.score ? a : b;
  return new Date(a.created_at) >= new Date(b.created_at) ? a : b;
}

/** Overall #1 across ranked modes. Cached until the next submitted score. */
export async function fetchHighScore(): Promise<ScoreRow | null> {
  if (highScoreCache !== undefined) return highScoreCache;
  if (highScoreInflight) return highScoreInflight;

  highScoreInflight = Promise.all([fetchTopScores('endless', 1), fetchTopScores('timed', 1)])
    .then(([endless, timed]) => {
      highScoreCache = pickHigherScore(endless[0], timed[0]);
      return highScoreCache;
    })
    .finally(() => {
      highScoreInflight = null;
    });

  return highScoreInflight;
}

export function invalidateHighScoreCache(): void {
  highScoreCache = undefined;
}

export async function submitScore(
  playerName: string,
  score: number,
  mode: GameMode,
): Promise<{ ok: boolean; error?: string }> {
  if (!isRankedMode(mode)) {
    return { ok: false, error: 'Tutorial scores are not ranked' };
  }
  const sb = getClient();
  if (!sb) {
    return { ok: false, error: 'Leaderboard not configured. Add Supabase keys to .env' };
  }

  const name = playerName.trim().slice(0, 16);
  if (!name) return { ok: false, error: 'Enter a name' };
  if (score < 0) return { ok: false, error: 'Invalid score' };

  const { error } = await sb.from('scores').insert({
    player_name: name,
    score: Math.floor(score),
    mode,
  });

  if (error) {
    console.warn('Score submit failed:', error.message);
    return { ok: false, error: error.message };
  }
  invalidateHighScoreCache();
  return { ok: true };
}
