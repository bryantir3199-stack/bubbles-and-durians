/**
 * Lightweight cartoon SFX via Web Audio (samples + synth fallback).
 */
let ctx: AudioContext | null = null;
let squishBuffer: AudioBuffer | null = null;
let squishLoad: Promise<AudioBuffer | null> | null = null;
let popBuffer: AudioBuffer | null = null;
let popLoad: Promise<AudioBuffer | null> | null = null;
let glitterBuffer: AudioBuffer | null = null;
let glitterLoad: Promise<AudioBuffer | null> | null = null;
let reloadBuffer: AudioBuffer | null = null;
let reloadLoad: Promise<AudioBuffer | null> | null = null;
let shootBuffers: AudioBuffer[] = [];
let shootLoad: Promise<AudioBuffer[]> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const ac = getCtx();
  if (!ac) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.arrayBuffer();
    return await ac.decodeAudioData(data.slice(0));
  } catch (err) {
    console.warn(`Failed to load SFX ${url}`, err);
    return null;
  }
}

/** Decode samples early so first shot / kill is snappy. */
export async function preloadSfx(): Promise<void> {
  await Promise.all([
    ensureSquishBuffer(),
    ensurePopBuffer(),
    ensureGlitterBuffer(),
    ensureReloadBuffer(),
    ensureShootBuffers(),
  ]);
}

async function ensureSquishBuffer(): Promise<AudioBuffer | null> {
  if (squishBuffer) return squishBuffer;
  if (squishLoad) return squishLoad;

  squishLoad = (async () => {
    squishBuffer = await loadBuffer('assets/slime-squish.wav');
    return squishBuffer;
  })();

  return squishLoad;
}

async function ensurePopBuffer(): Promise<AudioBuffer | null> {
  if (popBuffer) return popBuffer;
  if (popLoad) return popLoad;

  popLoad = (async () => {
    popBuffer = await loadBuffer('assets/bubble-pop.wav');
    return popBuffer;
  })();

  return popLoad;
}

async function ensureGlitterBuffer(): Promise<AudioBuffer | null> {
  if (glitterBuffer) return glitterBuffer;
  if (glitterLoad) return glitterLoad;

  glitterLoad = (async () => {
    glitterBuffer = await loadBuffer('assets/gold-glitter.wav');
    return glitterBuffer;
  })();

  return glitterLoad;
}

async function ensureReloadBuffer(): Promise<AudioBuffer | null> {
  if (reloadBuffer) return reloadBuffer;
  if (reloadLoad) return reloadLoad;

  reloadLoad = (async () => {
    reloadBuffer = await loadBuffer('assets/reload-tick.wav');
    return reloadBuffer;
  })();

  return reloadLoad;
}

async function ensureShootBuffers(): Promise<AudioBuffer[]> {
  if (shootBuffers.length > 0) return shootBuffers;
  if (shootLoad) return shootLoad;

  shootLoad = (async () => {
    const loaded = await Promise.all([
      loadBuffer('assets/munch1.wav'),
      loadBuffer('assets/munch2.wav'),
    ]);
    shootBuffers = loaded.filter((b): b is AudioBuffer => b != null);
    return shootBuffers;
  })();

  return shootLoad;
}

function playBuffer(
  buffer: AudioBuffer,
  gainValue = 0.85,
  rateJitter = 0.16,
  playbackRate?: number,
): void {
  const ac = getCtx();
  if (!ac) return;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buffer;
  // Fixed rate when provided; otherwise slight pitch variety so rapid plays don’t sound identical
  src.playbackRate.value =
    playbackRate ?? 1 - rateJitter / 2 + Math.random() * rateJitter;
  gain.gain.value = gainValue;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(0);
}

/** Munch sample for shooting — randomly picks between the two clips. */
export function playShootSound(): void {
  const playRandom = (buffers: AudioBuffer[]) => {
    if (buffers.length === 0) return;
    const buffer = buffers[Math.floor(Math.random() * buffers.length)]!;
    playBuffer(buffer, 0.9, 0.12);
  };

  if (shootBuffers.length > 0) {
    playRandom(shootBuffers);
    return;
  }

  void ensureShootBuffers().then(playRandom);
}

/** Dry-fire click when empty. */
export function playDryFireSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
  gain.gain.setValueAtTime(0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.1);
}

/** Slime squish sample when a durian pops. */
export function playSquishSound(): void {
  if (squishBuffer) {
    playBuffer(squishBuffer);
    return;
  }

  void ensureSquishBuffer().then((buf) => {
    if (buf) playBuffer(buf);
  });
}

/** Bubble pop sample when a bubble is shot. */
export function playPopSound(): void {
  if (popBuffer) {
    playBuffer(popBuffer, 0.95, 0.1);
    return;
  }

  void ensurePopBuffer().then((buf) => {
    if (buf) playBuffer(buf, 0.95, 0.1);
  });
}

/** Magic glitter sample when a gold durian becomes camera-visible. */
export function playGlitterSound(): void {
  if (glitterBuffer) {
    playBuffer(glitterBuffer, 0.75, 0.06);
    return;
  }

  void ensureGlitterBuffer().then((buf) => {
    if (buf) playBuffer(buf, 0.75, 0.06);
  });
}

/**
 * One tick per shell restored during reload.
 * @param progress01 0 = first shell (low pitch), 1 = last shell (high pitch)
 */
export function playReloadShellSound(progress01: number): void {
  const t = Math.max(0, Math.min(1, progress01));
  // Rising click ladder across the reload sequence.
  const rate = 0.72 + t * 0.58;
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.7, 0, rate);

  if (reloadBuffer) {
    play(reloadBuffer);
    return;
  }

  void ensureReloadBuffer().then((buf) => {
    if (buf) play(buf);
  });
}
