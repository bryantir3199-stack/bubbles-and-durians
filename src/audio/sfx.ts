/**
 * Lightweight cartoon SFX via Web Audio (samples + synth fallback).
 */
let ctx: AudioContext | null = null;
let squishBuffer: AudioBuffer | null = null;
let squishLoad: Promise<AudioBuffer | null> | null = null;
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
  await Promise.all([ensureSquishBuffer(), ensureShootBuffers()]);
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

/** Cartoon bubble pop when a bubble is shot. */
export function playPopSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const dur = 0.14;
  const jitter = 0.9 + Math.random() * 0.2;

  // Soft noise burst for the "pop" body
  const noiseLen = Math.floor(ac.sampleRate * dur);
  const noiseBuf = ac.createBuffer(1, noiseLen, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    const env = 1 - i / noiseLen;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuf;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(900 * jitter, t0);
  band.frequency.exponentialRampToValueAtTime(280 * jitter, t0 + dur);
  band.Q.value = 1.2;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.28, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(ac.destination);
  noise.start(t0);
  noise.stop(t0 + dur);

  // Quick descending tone on top
  const osc = ac.createOscillator();
  const oscGain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(620 * jitter, t0);
  osc.frequency.exponentialRampToValueAtTime(120 * jitter, t0 + 0.1);
  oscGain.gain.setValueAtTime(0.2, t0);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
  osc.connect(oscGain);
  oscGain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}
