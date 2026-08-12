/**
 * Lightweight cartoon SFX via Web Audio (samples + synth fallback).
 */
/** Global multiplier applied to every one-shot SFX gain. */
const SFX_VOLUME_SCALE = 1.5;
/** Looping stage BGM level (before SFX scale — kept quieter than one-shots). */
const STAGE_BGM_GAIN = 0.4;

let muted = false;
let ctx: AudioContext | null = null;
let squishBuffer: AudioBuffer | null = null;
let squishLoad: Promise<AudioBuffer | null> | null = null;
let popBuffer: AudioBuffer | null = null;
let popLoad: Promise<AudioBuffer | null> | null = null;
let glitterBuffer: AudioBuffer | null = null;
let glitterLoad: Promise<AudioBuffer | null> | null = null;
let reloadBuffer: AudioBuffer | null = null;
let reloadLoad: Promise<AudioBuffer | null> | null = null;
let dryFireBuffer: AudioBuffer | null = null;
let dryFireLoad: Promise<AudioBuffer | null> | null = null;
let clockTickBuffer: AudioBuffer | null = null;
let clockTickLoad: Promise<AudioBuffer | null> | null = null;
let shootBuffers: AudioBuffer[] = [];
let shootLoad: Promise<AudioBuffer[]> | null = null;
let bgmBuffer: AudioBuffer | null = null;
let bgmLoad: Promise<AudioBuffer | null> | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;
/** True while a play session wants stage BGM (even if currently paused). */
let bgmActive = false;
/** True while stage BGM is paused mid-session (game pause). */
let bgmPaused = false;
/** AudioContext time when the current BGM source started. */
let bgmStartCtxTime = 0;
/** Playback offset (seconds into the buffer) when the current BGM source started. */
let bgmOffset = 0;

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

/** Decode samples early so first shot / kill / stage music is snappy. */
export async function preloadSfx(): Promise<void> {
  await Promise.all([
    ensureSquishBuffer(),
    ensurePopBuffer(),
    ensureGlitterBuffer(),
    ensureReloadBuffer(),
    ensureDryFireBuffer(),
    ensureClockTickBuffer(),
    ensureShootBuffers(),
    ensureBgmBuffer(),
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

async function ensureDryFireBuffer(): Promise<AudioBuffer | null> {
  if (dryFireBuffer) return dryFireBuffer;
  if (dryFireLoad) return dryFireLoad;

  dryFireLoad = (async () => {
    dryFireBuffer = await loadBuffer('assets/dry-fire.wav');
    return dryFireBuffer;
  })();

  return dryFireLoad;
}

async function ensureClockTickBuffer(): Promise<AudioBuffer | null> {
  if (clockTickBuffer) return clockTickBuffer;
  if (clockTickLoad) return clockTickLoad;

  clockTickLoad = (async () => {
    clockTickBuffer = await loadBuffer('assets/clock-tick.wav');
    return clockTickBuffer;
  })();

  return clockTickLoad;
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

async function ensureBgmBuffer(): Promise<AudioBuffer | null> {
  if (bgmBuffer) return bgmBuffer;
  if (bgmLoad) return bgmLoad;

  bgmLoad = (async () => {
    bgmBuffer = await loadBuffer('assets/stage-bgm.ogg');
    return bgmBuffer;
  })();

  return bgmLoad;
}

export function isMuted(): boolean {
  return muted;
}

function applyBgmGain(): void {
  if (!bgmGain) return;
  bgmGain.gain.value = muted || bgmPaused ? 0 : STAGE_BGM_GAIN;
}

/** Mute or unmute all SFX and stage BGM. Returns the new muted state. */
export function setMuted(value: boolean): boolean {
  muted = value;
  applyBgmGain();
  return muted;
}

/** Toggle mute. Returns the new muted state. */
export function toggleMute(): boolean {
  return setMuted(!muted);
}

function playBuffer(
  buffer: AudioBuffer,
  gainValue = 0.85,
  rateJitter = 0.16,
  playbackRate?: number,
): void {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buffer;
  // Fixed rate when provided; otherwise slight pitch variety so rapid plays don’t sound identical
  src.playbackRate.value =
    playbackRate ?? 1 - rateJitter / 2 + Math.random() * rateJitter;
  gain.gain.value = gainValue * SFX_VOLUME_SCALE;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(0);
}

function tearDownBgmSource(): void {
  if (bgmSource) {
    try {
      bgmSource.stop();
    } catch {
      // already stopped
    }
    try {
      bgmSource.disconnect();
    } catch {
      // already disconnected
    }
    bgmSource = null;
  }
  if (bgmGain) {
    try {
      bgmGain.disconnect();
    } catch {
      // already disconnected
    }
    bgmGain = null;
  }
}

function beginBgmFromOffset(ac: AudioContext, buffer: AudioBuffer, offsetSec: number): void {
  tearDownBgmSource();

  const duration = buffer.duration || 1;
  const offset = ((offsetSec % duration) + duration) % duration;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain);
  gain.connect(ac.destination);
  bgmSource = src;
  bgmGain = gain;
  bgmOffset = offset;
  bgmStartCtxTime = ac.currentTime;
  applyBgmGain();
  src.start(0, offset);
}

/** Start looping stage BGM while a play session is active. */
export function startStageBgm(): void {
  const ac = getCtx();
  if (!ac) return;

  bgmActive = true;
  bgmPaused = false;
  bgmOffset = 0;
  tearDownBgmSource();

  const begin = (buffer: AudioBuffer) => {
    if (!bgmActive || bgmPaused) return;
    beginBgmFromOffset(ac, buffer, bgmOffset);
  };

  if (bgmBuffer) {
    begin(bgmBuffer);
    return;
  }

  void ensureBgmBuffer().then((buf) => {
    if (buf) begin(buf);
  });
}

/** Pause looping stage BGM (keeps playback position for resume). */
export function pauseStageBgm(): void {
  if (bgmPaused) return;
  bgmPaused = true;
  const ac = ctx;
  if (bgmSource && bgmBuffer && ac) {
    const duration = bgmBuffer.duration || 1;
    bgmOffset =
      (((ac.currentTime - bgmStartCtxTime + bgmOffset) % duration) + duration) % duration;
    tearDownBgmSource();
  }
}

/** Resume looping stage BGM from the paused playback position. */
export function resumeStageBgm(): void {
  if (!bgmPaused) return;
  bgmPaused = false;
  if (!bgmActive) return;
  const ac = getCtx();
  if (!ac || !bgmBuffer) return;
  beginBgmFromOffset(ac, bgmBuffer, bgmOffset);
}

/** Stop looping stage BGM when leaving play. */
export function stopStageBgm(): void {
  bgmActive = false;
  bgmPaused = false;
  bgmOffset = 0;
  bgmStartCtxTime = 0;
  tearDownBgmSource();
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

/** Empty-magazine click when the player shoots with no ammo. */
export function playDryFireSound(): void {
  if (dryFireBuffer) {
    playBuffer(dryFireBuffer, 0.85, 0, 1);
    return;
  }

  void ensureDryFireBuffer().then((buf) => {
    if (buf) playBuffer(buf, 0.85, 0, 1);
  });
}

/** Clock tick for each second of the final countdown. */
export function playCountdownTickSound(): void {
  if (clockTickBuffer) {
    playBuffer(clockTickBuffer, 3.6, 0, 1);
    return;
  }

  void ensureClockTickBuffer().then((buf) => {
    if (buf) playBuffer(buf, 3.6, 0, 1);
  });
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
