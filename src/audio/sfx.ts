/**
 * Lightweight cartoon SFX via Web Audio (samples + synth fallback).
 */
let ctx: AudioContext | null = null;
let squishBuffer: AudioBuffer | null = null;
let squishLoad: Promise<AudioBuffer | null> | null = null;
let popBuffer: AudioBuffer | null = null;
let popLoad: Promise<AudioBuffer | null> | null = null;
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
  await Promise.all([ensureSquishBuffer(), ensurePopBuffer(), ensureShootBuffers()]);
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

function playBuffer(buffer: AudioBuffer, gainValue = 0.85, rateJitter = 0.16): void {
  const ac = getCtx();
  if (!ac) return;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buffer;
  // Slight pitch variety so rapid plays don’t sound identical
  src.playbackRate.value = 1 - rateJitter / 2 + Math.random() * rateJitter;
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

/**
 * Sparkling glitter synth when a gold durian appears —
 * a burst of short, high, randomized tings with a soft shimmer bed.
 */
export function playGlitterSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;

  // Soft airy bed so the sparkles feel like they bloom in.
  const bed = ac.createOscillator();
  const bedGain = ac.createGain();
  const bedFilter = ac.createBiquadFilter();
  bed.type = 'sine';
  bed.frequency.setValueAtTime(880, t0);
  bed.frequency.exponentialRampToValueAtTime(1320, t0 + 0.28);
  bedFilter.type = 'bandpass';
  bedFilter.frequency.value = 2400;
  bedFilter.Q.value = 0.7;
  bedGain.gain.setValueAtTime(0.0001, t0);
  bedGain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.04);
  bedGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
  bed.connect(bedFilter);
  bedFilter.connect(bedGain);
  bedGain.connect(ac.destination);
  bed.start(t0);
  bed.stop(t0 + 0.4);

  // Cluster of tiny crystal tings — staggered + pitch-jittered.
  const sparkleFreqs = [2093, 2349, 2637, 3136, 3520, 4186, 4699];
  const sparkleCount = 9;
  for (let i = 0; i < sparkleCount; i++) {
    const delay = 0.018 + i * 0.028 + Math.random() * 0.02;
    const t = t0 + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const base = sparkleFreqs[i % sparkleFreqs.length]!;
    const freq = base * (0.96 + Math.random() * 0.1);
    osc.type = i % 3 === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.08, t + 0.05);
    const peak = 0.055 + Math.random() * 0.03;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + Math.random() * 0.04);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }
}
