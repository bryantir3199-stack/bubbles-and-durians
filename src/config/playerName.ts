/** Arcade-style initials: exactly 3 letters, digits, or punctuation. */

export const PLAYER_NAME_LENGTH = 3;
export const PLAYER_NAME_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.?!<>,;:'\"-/\\@#$%&*+=()[]{}~^|";

const BANNED = new Set([
  'SEX', 'XXX',
  'ASS', 'AZZ', 'AHO',
  'FUK', 'FUC', 'FCK', 'FUQ', 'FUX', 'FGT', 'FAG', 'FFS', 'FAP',
  'DIK', 'DIC', 'DCK', 'DNG', 'PNS',
  'COK', 'COC',
  'TIT', 'CUM', 'JIZ', 'JZZ',
  'CNT', 'CUN', 'PUS', 'VAG', 'ANL',
  'POO', 'PEE', 'PIS', 'BUM', 'NOB',
  'HOE', 'SLT', 'SUC', 'SUX',
  'SHT', 'WTF',
  'NIG', 'NGR', 'NGA', 'KKK',
  'NAZ', 'NZI', 'KYK', 'SPK', 'WOP', 'WOG', 'GYP',
  'DYK', 'KYS', 'RAP', 'RPE', 'PED',
  'STD', 'THC', 'LSD', 'XTC',
]);

function normalizeLeet(name: string): string {
  return name
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/2/g, 'Z')
    .replace(/3/g, 'E')
    .replace(/4/g, 'A')
    .replace(/5/g, 'S')
    .replace(/6/g, 'G')
    .replace(/7/g, 'T')
    .replace(/8/g, 'B')
    .replace(/9/g, 'G');
}

export function sanitizePlayerName(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => PLAYER_NAME_CHARS.includes(ch))
    .join('')
    .slice(0, PLAYER_NAME_LENGTH);
}

export function isBannedPlayerName(name: string): boolean {
  if (name.length !== PLAYER_NAME_LENGTH) return false;
  const upper = name.toUpperCase();
  return BANNED.has(upper) || BANNED.has(normalizeLeet(upper));
}

export function validatePlayerName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = sanitizePlayerName(raw);
  if (name.length !== PLAYER_NAME_LENGTH) {
    return { ok: false, error: 'Enter 3 initials' };
  }
  if (isBannedPlayerName(name)) {
    return { ok: false, error: 'That name isn’t allowed' };
  }
  return { ok: true, name };
}

/** Shortest reel roll from one initials character to another. */
export function shortestPlayerSpin(from: string, to: string): { dir: 1 | -1; steps: number } {
  const start = PLAYER_NAME_CHARS.indexOf(from || 'A');
  const end = PLAYER_NAME_CHARS.indexOf(to);
  if (start < 0 || end < 0 || start === end) return { dir: 1, steps: 0 };
  const forward = (end - start + PLAYER_NAME_CHARS.length) % PLAYER_NAME_CHARS.length;
  const backward = (start - end + PLAYER_NAME_CHARS.length) % PLAYER_NAME_CHARS.length;
  if (forward <= backward) return { dir: 1, steps: forward };
  return { dir: -1, steps: backward };
}

export function cyclePlayerChar(current: string, dir: 1 | -1): string {
  const last = PLAYER_NAME_CHARS.at(-1) ?? 'A';
  if (!current) return dir === 1 ? 'A' : last;
  const index = PLAYER_NAME_CHARS.indexOf(current);
  if (index < 0) return 'A';
  const next = (index + dir + PLAYER_NAME_CHARS.length) % PLAYER_NAME_CHARS.length;
  return PLAYER_NAME_CHARS[next] ?? 'A';
}

/** Neighbor on the initials reel. Empty slots show `_` at the center. */
export function offsetPlayerChar(current: string, delta: number): string {
  if (delta === 0) return current || '_';
  const dir = delta > 0 ? 1 : -1;
  let ch = current;
  for (let i = 0; i < Math.abs(delta); i++) ch = cyclePlayerChar(ch, dir);
  return ch;
}
