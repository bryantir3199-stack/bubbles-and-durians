/**
 * Lightweight cartoon SFX via Web Audio (samples + synth fallback).
 */
import { getSettings, onSettingsChange, setAudioSettings } from '../config/settings';

/** Base multiplier applied to every one-shot SFX gain. */
const SFX_BASE_SCALE = 1.5;
/** Base looping stage BGM level (kept quieter than one-shots). */
const STAGE_BGM_BASE_GAIN = 0.4;

/** Get effective SFX volume scale (base × user setting). */
function getSfxScale(): number {
  const settings = getSettings();
  return SFX_BASE_SCALE * settings.audio.sfxVolume;
}

/** Results BGM plays twice as loud as stage BGM. */
const RESULTS_BGM_BASE_GAIN = STAGE_BGM_BASE_GAIN * 2;
/** Menu BGM plays twice as loud as stage BGM. */
const MENU_BGM_BASE_GAIN = STAGE_BGM_BASE_GAIN * 2;

/** Get effective BGM gain (base × user setting). */
function getBgmGain(): number {
  const settings = getSettings();
  return STAGE_BGM_BASE_GAIN * settings.audio.musicVolume;
}

function getResultsBgmGain(): number {
  const settings = getSettings();
  return RESULTS_BGM_BASE_GAIN * settings.audio.musicVolume;
}

function getMenuBgmGain(): number {
  const settings = getSettings();
  return MENU_BGM_BASE_GAIN * settings.audio.musicVolume;
}

/** Sync muted state from settings. */
function syncMutedFromSettings(): void {
  muted = getSettings().audio.muted;
  applyBgmGain();
  applyBubbleLoopGains();
}

let muted = getSettings().audio.muted;

// Subscribe to settings changes
onSettingsChange(syncMutedFromSettings);
let ctx: AudioContext | null = null;
let squishBuffer: AudioBuffer | null = null;
let squishLoad: Promise<AudioBuffer | null> | null = null;
let popBuffer: AudioBuffer | null = null;
let popReverseBuffer: AudioBuffer | null = null;
let popLoopBuffer: AudioBuffer | null = null;
let popLoad: Promise<AudioBuffer | null> | null = null;
/** Alternate bubble SFX: false = start forward, true = start reverse. */
let popPlayReverse = false;

const BUBBLE_LOOP_GAIN = 0.14375;
/** Base loop was 2×; unchased bubbles run 50% slower, chased 50% faster. */
const BUBBLE_LOOP_RATE = 1;
const BUBBLE_LOOP_RATE_CHASED = 3;
const bubbleLoops = new Set<BubbleLoopHandle>();

export interface BubbleLoopHandle {
  stopped: boolean;
  playbackRate: number;
  src: AudioBufferSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
}
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
let teethFlybyABuffer: AudioBuffer | null = null;
let teethFlybyALoad: Promise<AudioBuffer | null> | null = null;
let teethFlybyBBuffer: AudioBuffer | null = null;
let teethFlybyBLoad: Promise<AudioBuffer | null> | null = null;
let teethWarnBeepBuffer: AudioBuffer | null = null;
let teethWarnBeepLoad: Promise<AudioBuffer | null> | null = null;
let teethHitApplauseBuffer: AudioBuffer | null = null;
let teethHitApplauseLoad: Promise<AudioBuffer | null> | null = null;
let teethHitHoorayBuffer: AudioBuffer | null = null;
let teethHitHoorayLoad: Promise<AudioBuffer | null> | null = null;
let bgmBuffer: AudioBuffer | null = null;
let bgmLoad: Promise<AudioBuffer | null> | null = null;
let resultsBgmBuffer: AudioBuffer | null = null;
let resultsBgmLoad: Promise<AudioBuffer | null> | null = null;
let gameStartBuffer: AudioBuffer | null = null;
let gameStartLoad: Promise<AudioBuffer | null> | null = null;
let menuButtonBuffer: AudioBuffer | null = null;
let menuButtonLoad: Promise<AudioBuffer | null> | null = null;
let tutorialSelectBuffer: AudioBuffer | null = null;
let tutorialSelectLoad: Promise<AudioBuffer | null> | null = null;
let tallyCalcDrumrollBuffer: AudioBuffer | null = null;
let tallyCalcDrumrollLoad: Promise<AudioBuffer | null> | null = null;
let tallyRevealDrumrollBuffer: AudioBuffer | null = null;
let tallyRevealDrumrollLoad: Promise<AudioBuffer | null> | null = null;
let tallyThudBuffer: AudioBuffer | null = null;
let tallyThudLoad: Promise<AudioBuffer | null> | null = null;
let comboLostBuffer: AudioBuffer | null = null;
let comboLostLoad: Promise<AudioBuffer | null> | null = null;
let comboLevelBuffer: AudioBuffer | null = null;
let comboLevelLoad: Promise<AudioBuffer | null> | null = null;
let coachWhistleBuffer: AudioBuffer | null = null;
let coachWhistleLoad: Promise<AudioBuffer | null> | null = null;
let resultsSlamBuffer: AudioBuffer | null = null;
let resultsSlamLoad: Promise<AudioBuffer | null> | null = null;
let tallyCalcDrumrollSource: AudioBufferSourceNode | null = null;
let tallyCalcDrumrollGain: GainNode | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGain: GainNode | null = null;
let resultsBgmSource: AudioBufferSourceNode | null = null;
let resultsBgmGain: GainNode | null = null;
let resultsBgmActive = false;
let resultsBgmStartTimer = 0;
let menuBgmBuffer: AudioBuffer | null = null;
let menuBgmLoad: Promise<AudioBuffer | null> | null = null;
let menuBgmSource: AudioBufferSourceNode | null = null;
let menuBgmGain: GainNode | null = null;
let menuBgmActive = false;
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
    ensureTeethFlybyABuffer(),
    ensureTeethFlybyBBuffer(),
    ensureTeethWarnBeepBuffer(),
    ensureTeethHitApplauseBuffer(),
    ensureTeethHitHoorayBuffer(),
    ensureBgmBuffer(),
    ensureResultsBgmBuffer(),
    ensureMenuBgmBuffer(),
    ensureGameStartBuffer(),
    ensureMenuButtonBuffer(),
    ensureTutorialSelectBuffer(),
    ensureTallyCalcDrumrollBuffer(),
    ensureTallyRevealDrumrollBuffer(),
    ensureTallyThudBuffer(),
    ensureComboLostBuffer(),
    ensureComboLevelBuffer(),
    ensureCoachWhistleBuffer(),
    ensureResultsSlamBuffer(),
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
    if (popBuffer) {
      popReverseBuffer = reverseAudioBuffer(popBuffer);
      popLoopBuffer = makePingPongBuffer(popBuffer);
    }
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

async function ensureTeethFlybyABuffer(): Promise<AudioBuffer | null> {
  if (teethFlybyABuffer) return teethFlybyABuffer;
  if (teethFlybyALoad) return teethFlybyALoad;

  teethFlybyALoad = (async () => {
    teethFlybyABuffer = await loadBuffer('assets/teeth-flyby-a.wav');
    return teethFlybyABuffer;
  })();

  return teethFlybyALoad;
}

async function ensureTeethFlybyBBuffer(): Promise<AudioBuffer | null> {
  if (teethFlybyBBuffer) return teethFlybyBBuffer;
  if (teethFlybyBLoad) return teethFlybyBLoad;

  teethFlybyBLoad = (async () => {
    teethFlybyBBuffer = await loadBuffer('assets/teeth-flyby-b.wav');
    return teethFlybyBBuffer;
  })();

  return teethFlybyBLoad;
}

async function ensureTeethWarnBeepBuffer(): Promise<AudioBuffer | null> {
  if (teethWarnBeepBuffer) return teethWarnBeepBuffer;
  if (teethWarnBeepLoad) return teethWarnBeepLoad;

  teethWarnBeepLoad = (async () => {
    teethWarnBeepBuffer = await loadBuffer('assets/teeth-warn-beep.mp3');
    return teethWarnBeepBuffer;
  })();

  return teethWarnBeepLoad;
}

async function ensureTeethHitApplauseBuffer(): Promise<AudioBuffer | null> {
  if (teethHitApplauseBuffer) return teethHitApplauseBuffer;
  if (teethHitApplauseLoad) return teethHitApplauseLoad;

  teethHitApplauseLoad = (async () => {
    teethHitApplauseBuffer = await loadBuffer('assets/teeth-hit-applause.mp3');
    return teethHitApplauseBuffer;
  })();

  return teethHitApplauseLoad;
}

async function ensureTeethHitHoorayBuffer(): Promise<AudioBuffer | null> {
  if (teethHitHoorayBuffer) return teethHitHoorayBuffer;
  if (teethHitHoorayLoad) return teethHitHoorayLoad;

  teethHitHoorayLoad = (async () => {
    teethHitHoorayBuffer = await loadBuffer('assets/teeth-hit-hooray.wav');
    return teethHitHoorayBuffer;
  })();

  return teethHitHoorayLoad;
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

async function ensureResultsBgmBuffer(): Promise<AudioBuffer | null> {
  if (resultsBgmBuffer) return resultsBgmBuffer;
  if (resultsBgmLoad) return resultsBgmLoad;

  resultsBgmLoad = (async () => {
    resultsBgmBuffer = await loadBuffer('assets/results-bgm.mp3');
    return resultsBgmBuffer;
  })();

  return resultsBgmLoad;
}

async function ensureMenuBgmBuffer(): Promise<AudioBuffer | null> {
  if (menuBgmBuffer) return menuBgmBuffer;
  if (menuBgmLoad) return menuBgmLoad;

  menuBgmLoad = (async () => {
    menuBgmBuffer = await loadBuffer('assets/menu-bgm.mp3');
    return menuBgmBuffer;
  })();

  return menuBgmLoad;
}

async function ensureGameStartBuffer(): Promise<AudioBuffer | null> {
  if (gameStartBuffer) return gameStartBuffer;
  if (gameStartLoad) return gameStartLoad;

  gameStartLoad = (async () => {
    gameStartBuffer = await loadBuffer('assets/game-start.ogg');
    return gameStartBuffer;
  })();

  return gameStartLoad;
}

async function ensureMenuButtonBuffer(): Promise<AudioBuffer | null> {
  if (menuButtonBuffer) return menuButtonBuffer;
  if (menuButtonLoad) return menuButtonLoad;

  menuButtonLoad = (async () => {
    menuButtonBuffer = await loadBuffer('assets/menu-button.wav');
    return menuButtonBuffer;
  })();

  return menuButtonLoad;
}

async function ensureTutorialSelectBuffer(): Promise<AudioBuffer | null> {
  if (tutorialSelectBuffer) return tutorialSelectBuffer;
  if (tutorialSelectLoad) return tutorialSelectLoad;

  tutorialSelectLoad = (async () => {
    tutorialSelectBuffer = await loadBuffer('assets/tutorial-select.wav');
    return tutorialSelectBuffer;
  })();

  return tutorialSelectLoad;
}

async function ensureTallyCalcDrumrollBuffer(): Promise<AudioBuffer | null> {
  if (tallyCalcDrumrollBuffer) return tallyCalcDrumrollBuffer;
  if (tallyCalcDrumrollLoad) return tallyCalcDrumrollLoad;

  tallyCalcDrumrollLoad = (async () => {
    tallyCalcDrumrollBuffer = await loadBuffer('assets/tally-calc-drumroll.mp3');
    return tallyCalcDrumrollBuffer;
  })();

  return tallyCalcDrumrollLoad;
}

async function ensureTallyRevealDrumrollBuffer(): Promise<AudioBuffer | null> {
  if (tallyRevealDrumrollBuffer) return tallyRevealDrumrollBuffer;
  if (tallyRevealDrumrollLoad) return tallyRevealDrumrollLoad;

  tallyRevealDrumrollLoad = (async () => {
    tallyRevealDrumrollBuffer = await loadBuffer('assets/tally-reveal-drumroll.wav');
    return tallyRevealDrumrollBuffer;
  })();

  return tallyRevealDrumrollLoad;
}

async function ensureTallyThudBuffer(): Promise<AudioBuffer | null> {
  if (tallyThudBuffer) return tallyThudBuffer;
  if (tallyThudLoad) return tallyThudLoad;

  tallyThudLoad = (async () => {
    tallyThudBuffer = await loadBuffer('assets/tally-thud.wav');
    return tallyThudBuffer;
  })();

  return tallyThudLoad;
}

async function ensureComboLostBuffer(): Promise<AudioBuffer | null> {
  if (comboLostBuffer) return comboLostBuffer;
  if (comboLostLoad) return comboLostLoad;

  comboLostLoad = (async () => {
    comboLostBuffer = await loadBuffer('assets/combo-lost.mp3');
    return comboLostBuffer;
  })();

  return comboLostLoad;
}

async function ensureComboLevelBuffer(): Promise<AudioBuffer | null> {
  if (comboLevelBuffer) return comboLevelBuffer;
  if (comboLevelLoad) return comboLevelLoad;

  comboLevelLoad = (async () => {
    comboLevelBuffer = await loadBuffer('assets/combo-level.wav');
    return comboLevelBuffer;
  })();

  return comboLevelLoad;
}

async function ensureCoachWhistleBuffer(): Promise<AudioBuffer | null> {
  if (coachWhistleBuffer) return coachWhistleBuffer;
  if (coachWhistleLoad) return coachWhistleLoad;

  coachWhistleLoad = (async () => {
    coachWhistleBuffer = await loadBuffer('assets/coach-whistle.wav');
    return coachWhistleBuffer;
  })();

  return coachWhistleLoad;
}

async function ensureResultsSlamBuffer(): Promise<AudioBuffer | null> {
  if (resultsSlamBuffer) return resultsSlamBuffer;
  if (resultsSlamLoad) return resultsSlamLoad;

  resultsSlamLoad = (async () => {
    resultsSlamBuffer = await loadBuffer('assets/results-slam.wav');
    return resultsSlamBuffer;
  })();

  return resultsSlamLoad;
}

export function isMuted(): boolean {
  return muted;
}

function applyBgmGain(): void {
  if (bgmGain) bgmGain.gain.value = muted || bgmPaused ? 0 : getBgmGain();
  if (resultsBgmGain) resultsBgmGain.gain.value = muted ? 0 : getResultsBgmGain();
  if (menuBgmGain) menuBgmGain.gain.value = muted ? 0 : getMenuBgmGain();
}

/** Mute or unmute all SFX and stage BGM. Returns the new muted state. */
export function setMuted(value: boolean): boolean {
  muted = value;
  setAudioSettings({ muted: value });
  applyBgmGain();
  applyBubbleLoopGains();
  return muted;
}

/** Set the music volume (0-1). */
export function setMusicVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  setAudioSettings({ musicVolume: clamped });
  applyBgmGain();
}

/** Set the SFX volume (0-1). */
export function setSfxVolume(volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  setAudioSettings({ sfxVolume: clamped });
  applyBubbleLoopGains();
}

/** Get current music volume (0-1). */
export function getMusicVolume(): number {
  return getSettings().audio.musicVolume;
}

/** Get current SFX volume (0-1). */
export function getSfxVolume(): number {
  return getSettings().audio.sfxVolume;
}

/** Toggle mute. Returns the new muted state. */
export function toggleMute(): boolean {
  return setMuted(!muted);
}

function makePingPongBuffer(forward: AudioBuffer): AudioBuffer | null {
  const ac = getCtx();
  if (!ac) return null;
  const pingPong = ac.createBuffer(forward.numberOfChannels, forward.length * 2, forward.sampleRate);
  for (let c = 0; c < forward.numberOfChannels; c++) {
    const src = forward.getChannelData(c);
    const dst = pingPong.getChannelData(c);
    dst.set(src, 0);
    const off = src.length;
    for (let i = 0, j = src.length - 1; i < src.length; i++, j--) {
      dst[off + i] = src[j];
    }
  }
  return pingPong;
}

function bubbleLoopGainValue(): number {
  return muted ? 0 : BUBBLE_LOOP_GAIN * getSfxScale();
}

function applyBubbleLoopGains(): void {
  const g = bubbleLoopGainValue();
  for (const handle of bubbleLoops) {
    if (handle.stopped || !handle.gain) continue;
    handle.gain.gain.value = g;
  }
}

function applyPlayListener(ac: AudioContext): void {
  const listener = ac.listener;
  if (listener.positionX) {
    listener.positionX.value = 0;
    listener.positionY.value = 110;
    listener.positionZ.value = 635;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    const legacy = listener as AudioListener & {
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (
        fx: number,
        fy: number,
        fz: number,
        ux: number,
        uy: number,
        uz: number,
      ) => void;
    };
    legacy.setPosition?.(0, 110, 635);
    legacy.setOrientation?.(0, 0, -1, 0, 1, 0);
  }
}

function setPannerPosition(panner: PannerNode, x: number, y: number, z: number): void {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    (
      panner as PannerNode & {
        setPosition?: (x: number, y: number, z: number) => void;
      }
    ).setPosition?.(x, y, z);
  }
}

function connectBubbleLoop(
  handle: BubbleLoopHandle,
  buffer: AudioBuffer,
  x: number,
  y: number,
  z: number,
): void {
  if (handle.stopped) return;
  const ac = getCtx();
  if (!ac) return;

  applyPlayListener(ac);

  const src = ac.createBufferSource();
  const panner = ac.createPanner();
  const gain = ac.createGain();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = handle.playbackRate;

  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 280;
  panner.maxDistance = 1400;
  panner.rolloffFactor = 1.15;
  setPannerPosition(panner, x, y, z);

  gain.gain.value = bubbleLoopGainValue();
  src.connect(panner);
  panner.connect(gain);
  gain.connect(ac.destination);

  const offset = popPlayReverse ? buffer.duration * 0.5 : 0;
  popPlayReverse = !popPlayReverse;
  src.start(0, offset);

  handle.src = src;
  handle.panner = panner;
  handle.gain = gain;
}

/** Looping spatial bezier SFX at a bubble's world position (ping-pong). */
export function startBubbleLoop(
  x: number,
  y: number,
  z: number,
  chased = false,
): BubbleLoopHandle {
  const handle: BubbleLoopHandle = {
    stopped: false,
    playbackRate: chased ? BUBBLE_LOOP_RATE_CHASED : BUBBLE_LOOP_RATE,
    src: null,
    panner: null,
    gain: null,
  };
  bubbleLoops.add(handle);

  const begin = (buf: AudioBuffer | null) => {
    if (!buf || handle.stopped) return;
    connectBubbleLoop(handle, buf, x, y, z);
  };

  if (popLoopBuffer) begin(popLoopBuffer);
  else void ensurePopBuffer().then(() => begin(popLoopBuffer));

  return handle;
}

export function setBubbleLoopPosition(
  handle: BubbleLoopHandle,
  x: number,
  y: number,
  z: number,
): void {
  if (handle.stopped || !handle.panner) return;
  setPannerPosition(handle.panner, x, y, z);
}

export function stopBubbleLoop(handle: BubbleLoopHandle | null | undefined): void {
  if (!handle || handle.stopped) return;
  handle.stopped = true;
  bubbleLoops.delete(handle);
  try {
    handle.src?.stop();
  } catch {
    // already stopped
  }
  try {
    handle.src?.disconnect();
  } catch {
    // already disconnected
  }
  try {
    handle.panner?.disconnect();
  } catch {
    // already disconnected
  }
  try {
    handle.gain?.disconnect();
  } catch {
    // already disconnected
  }
  handle.src = null;
  handle.panner = null;
  handle.gain = null;
}

function reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer | null {
  const ac = getCtx();
  if (!ac) return null;
  const reversed = ac.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = reversed.getChannelData(c);
    for (let i = 0, j = src.length - 1; i < src.length; i++, j--) {
      dst[i] = src[j];
    }
  }
  return reversed;
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
  gain.gain.value = gainValue * getSfxScale();
  src.connect(gain);
  gain.connect(ac.destination);
  src.start();
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
  stopMenuBgm();
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

function tearDownResultsBgmSource(): void {
  if (resultsBgmSource) {
    try {
      resultsBgmSource.stop();
    } catch {
      // already stopped
    }
    try {
      resultsBgmSource.disconnect();
    } catch {
      // already disconnected
    }
    resultsBgmSource = null;
  }
  if (resultsBgmGain) {
    try {
      resultsBgmGain.disconnect();
    } catch {
      // already disconnected
    }
    resultsBgmGain = null;
  }
}

function tearDownMenuBgmSource(): void {
  if (menuBgmSource) {
    try {
      menuBgmSource.stop();
    } catch {
      // already stopped
    }
    try {
      menuBgmSource.disconnect();
    } catch {
      // already disconnected
    }
    menuBgmSource = null;
  }
  if (menuBgmGain) {
    try {
      menuBgmGain.disconnect();
    } catch {
      // already disconnected
    }
    menuBgmGain = null;
  }
}

/** Start looping main-menu BGM. Safe to call again while already playing. */
export function startMenuBgm(): void {
  const ac = getCtx();
  if (!ac) return;
  if (menuBgmActive) return;

  menuBgmActive = true;
  tearDownMenuBgmSource();

  const begin = (buffer: AudioBuffer) => {
    if (!menuBgmActive) return;
    tearDownMenuBgmSource();
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    gain.connect(ac.destination);
    menuBgmSource = src;
    menuBgmGain = gain;
    applyBgmGain();
    src.start();
  };

  if (menuBgmBuffer) {
    begin(menuBgmBuffer);
    return;
  }

  void ensureMenuBgmBuffer().then((buf) => {
    if (buf) begin(buf);
  });
}

/** Stop looping main-menu BGM. */
export function stopMenuBgm(): void {
  menuBgmActive = false;
  tearDownMenuBgmSource();
}

/** Ramp looping menu BGM to silence. */
export function fadeOutMenuBgm(durationSec = 0.5): void {
  if (!menuBgmActive) return;
  const ac = ctx;
  if (!menuBgmGain || !ac || muted) {
    stopMenuBgm();
    return;
  }
  const dur = Math.max(0.05, durationSec);
  const param = menuBgmGain.gain;
  const now = ac.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.linearRampToValueAtTime(0, now + dur);
  const gainNode = menuBgmGain;
  window.setTimeout(() => {
    if (menuBgmGain !== gainNode) return;
    stopMenuBgm();
  }, dur * 1000 + 40);
}

/** Start looping results music. Safe to call again while already playing or scheduled. */
export function startResultsBgm(delaySec = 0): void {
  stopMenuBgm();
  const ac = getCtx();
  if (!ac) return;
  if (resultsBgmActive) return;

  resultsBgmActive = true;
  tearDownResultsBgmSource();

  const begin = (buffer: AudioBuffer) => {
    if (!resultsBgmActive) return;
    tearDownResultsBgmSource();
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    gain.connect(ac.destination);
    resultsBgmSource = src;
    resultsBgmGain = gain;
    applyBgmGain();
    src.start();
  };

  const kickoff = () => {
    resultsBgmStartTimer = 0;
    if (!resultsBgmActive) return;
    if (resultsBgmBuffer) {
      begin(resultsBgmBuffer);
      return;
    }
    void ensureResultsBgmBuffer().then((buf) => {
      if (buf) begin(buf);
    });
  };

  if (delaySec > 0) {
    resultsBgmStartTimer = window.setTimeout(kickoff, delaySec * 1000);
    return;
  }
  kickoff();
}

/** Stop looping results music when leaving the results screens. */
export function stopResultsBgm(): void {
  resultsBgmActive = false;
  if (resultsBgmStartTimer) {
    window.clearTimeout(resultsBgmStartTimer);
    resultsBgmStartTimer = 0;
  }
  tearDownResultsBgmSource();
}

/** Ramp looping results BGM to silence (e.g. fade-to-black). */
export function fadeOutResultsBgm(durationSec = 0.5): void {
  if (!resultsBgmActive) return;
  const ac = ctx;
  if (!resultsBgmGain || !ac || muted) {
    stopResultsBgm();
    return;
  }
  const dur = Math.max(0.05, durationSec);
  const param = resultsBgmGain.gain;
  const now = ac.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.linearRampToValueAtTime(0, now + dur);
  const gainNode = resultsBgmGain;
  window.setTimeout(() => {
    if (resultsBgmGain !== gainNode) return;
    stopResultsBgm();
  }, dur * 1000 + 40);
}

/** Ramp looping stage BGM to silence (e.g. fade-to-black). */
export function fadeOutStageBgm(durationSec = 0.5): void {
  if (!bgmActive || bgmPaused) return;
  const ac = ctx;
  if (!bgmGain || !ac || muted) {
    stopStageBgm();
    return;
  }
  const dur = Math.max(0.05, durationSec);
  const param = bgmGain.gain;
  const now = ac.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.linearRampToValueAtTime(0, now + dur);
  const gainNode = bgmGain;
  window.setTimeout(() => {
    if (bgmGain !== gainNode) return;
    stopStageBgm();
  }, dur * 1000 + 40);
}

/** Munch sample for shooting — randomly picks between the two clips. */
export function playShootSound(): void {
  playMunchSample(0.9, 0.12);
}

/** Teeth-target chomp — same munch clips as the shot SFX (non-spatial). */
export function playChompSound(): void {
  playMunchSample(1.7, 0.1);
}

/**
 * Spatial teeth chomp at a world position (camera listener faces −Z).
 * Overlaps freely; callers should skip when the teeth are not visible.
 */
export function playChompSoundAt(x: number, y: number, z: number): void {
  if (muted) return;
  const play = (buffers: AudioBuffer[]) => {
    if (buffers.length === 0) return;
    const buffer = buffers[Math.floor(Math.random() * buffers.length)]!;
    playBufferAt(buffer, x, y, z, 1.7, 0.1);
  };
  if (shootBuffers.length > 0) {
    play(shootBuffers);
    return;
  }
  void ensureShootBuffers().then(play);
}

/**
 * Play a one-shot through a PannerNode at world XYZ.
 * Listener is the play camera (0, 110, 635) looking toward −Z.
 */
function playBufferAt(
  buffer: AudioBuffer,
  x: number,
  y: number,
  z: number,
  gainValue = 0.85,
  rateJitter = 0.16,
  playbackRate?: number,
): void {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;

  const listener = ac.listener;
  if (listener.positionX) {
    listener.positionX.value = 0;
    listener.positionY.value = 110;
    listener.positionZ.value = 635;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    // Safari legacy AudioListener
    const legacy = listener as AudioListener & {
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (
        fx: number,
        fy: number,
        fz: number,
        ux: number,
        uy: number,
        uz: number,
      ) => void;
    };
    legacy.setPosition?.(0, 110, 635);
    legacy.setOrientation?.(0, 0, -1, 0, 1, 0);
  }

  const src = ac.createBufferSource();
  const panner = ac.createPanner();
  const gain = ac.createGain();
  src.buffer = buffer;
  src.playbackRate.value =
    playbackRate ?? 1 - rateJitter / 2 + Math.random() * rateJitter;

  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 280;
  panner.maxDistance = 1400;
  panner.rolloffFactor = 1.15;
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    (
      panner as PannerNode & {
        setPosition?: (x: number, y: number, z: number) => void;
      }
    ).setPosition?.(x, y, z);
  }

  gain.gain.value = gainValue * getSfxScale();
  src.connect(panner);
  panner.connect(gain);
  gain.connect(ac.destination);
  src.start(0);
}

/**
 * Whoosh when the teeth first come on-screen.
 * Gain is 4× a typical one-shot (two +100% boosts).
 */
export function playTeethFlybyEnterSound(): void {
  if (teethFlybyABuffer) {
    playBuffer(teethFlybyABuffer, 3.6, 0, 1);
    return;
  }
  void ensureTeethFlybyABuffer().then((buf) => {
    if (buf) playBuffer(buf, 3.6, 0, 1);
  });
}

/**
 * Whoosh when the teeth reappear past the keep on the far side.
 * Gain is 4× a typical one-shot (two +100% boosts).
 */
export function playTeethFlybyExitSound(): void {
  if (teethFlybyBBuffer) {
    playBuffer(teethFlybyBBuffer, 3.6, 0, 1);
    return;
  }
  void ensureTeethFlybyBBuffer().then((buf) => {
    if (buf) playBuffer(buf, 3.6, 0, 1);
  });
}

/** Crowd applause + hooray when the player hits the teeth. */
export function playTeethHitSound(): void {
  const playApplause = (buf: AudioBuffer) => playBuffer(buf, 0.72, 0, 1);
  const playHooray = (buf: AudioBuffer) => playBuffer(buf, 0.9, 0, 1);
  if (teethHitApplauseBuffer) playApplause(teethHitApplauseBuffer);
  else {
    void ensureTeethHitApplauseBuffer().then((buf) => {
      if (buf) playApplause(buf);
    });
  }
  if (teethHitHoorayBuffer) playHooray(teethHitHoorayBuffer);
  else {
    void ensureTeethHitHoorayBuffer().then((buf) => {
      if (buf) playHooray(buf);
    });
  }
}

/** Short beep for each teeth-warn exclaim blink (overlaps freely). */
export function playTeethWarnBeepSound(): void {
  if (teethWarnBeepBuffer) {
    playBuffer(teethWarnBeepBuffer, 0.95, 0, 1);
    return;
  }
  void ensureTeethWarnBeepBuffer().then((buf) => {
    if (buf) playBuffer(buf, 0.95, 0, 1);
  });
}

function playMunchSample(gainValue: number, rateJitter: number): void {
  const playRandom = (buffers: AudioBuffer[]) => {
    if (buffers.length === 0) return;
    const buffer = buffers[Math.floor(Math.random() * buffers.length)]!;
    playBuffer(buffer, gainValue, rateJitter);
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

/** Coach whistle when a run ends (timer or last life). */
export function playGameOverWhistleSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.95, 0, 1);
  if (coachWhistleBuffer) {
    play(coachWhistleBuffer);
    return;
  }

  void ensureCoachWhistleBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Metallic anvil slam when the RESULTS plaque halves collide. */
export function playResultsSlamSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 1.05, 0, 1);
  if (resultsSlamBuffer) {
    play(resultsSlamBuffer);
    return;
  }

  void ensureResultsSlamBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Menu sting when starting Endless / Blitz / Standard. */
export function playGameStartSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.9, 0, 1);
  if (gameStartBuffer) {
    play(gameStartBuffer);
    return;
  }

  void ensureGameStartBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** UI click for menus and HUD controls (not How To Play overlay). */
export function playMenuButtonSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.85, 0, 1);
  if (menuButtonBuffer) {
    play(menuButtonBuffer);
    return;
  }

  void ensureMenuButtonBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

function tearDownTallyCalcDrumroll(): void {
  if (tallyCalcDrumrollSource) {
    try {
      tallyCalcDrumrollSource.stop();
    } catch {
      // already stopped
    }
    try {
      tallyCalcDrumrollSource.disconnect();
    } catch {
      // already disconnected
    }
    tallyCalcDrumrollSource = null;
  }
  if (tallyCalcDrumrollGain) {
    try {
      tallyCalcDrumrollGain.disconnect();
    } catch {
      // already disconnected
    }
    tallyCalcDrumrollGain = null;
  }
}

/** Ceremony drumroll while bonus rows count up. */
export function playTallyCalcDrumroll(): void {
  stopTallyCalcDrumroll(0);
  if (muted) return;

  const start = (buf: AudioBuffer) => {
    if (muted) return;
    const ac = getCtx();
    if (!ac) return;
    tearDownTallyCalcDrumroll();
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = 1;
    gain.gain.value = 0.9 * getSfxScale();
    src.connect(gain);
    gain.connect(ac.destination);
    tallyCalcDrumrollSource = src;
    tallyCalcDrumrollGain = gain;
    src.start(0);
  };

  if (tallyCalcDrumrollBuffer) {
    start(tallyCalcDrumrollBuffer);
    return;
  }
  void ensureTallyCalcDrumrollBuffer().then((buf) => {
    if (buf) start(buf);
  });
}

/** Stop the tally calculation drumroll (short fade into the final reveal). */
export function stopTallyCalcDrumroll(fadeSec = 0.12): void {
  const src = tallyCalcDrumrollSource;
  const gain = tallyCalcDrumrollGain;
  if (!src || !gain) return;
  tallyCalcDrumrollSource = null;
  tallyCalcDrumrollGain = null;

  const ac = ctx;
  const dur = Math.max(0, fadeSec);
  if (ac && dur > 0 && !muted) {
    const now = ac.currentTime;
    const param = gain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0.0001, param.value), now);
    param.linearRampToValueAtTime(0, now + dur);
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // already disconnected
      }
      try {
        gain.disconnect();
      } catch {
        // already disconnected
      }
    }, dur * 1000 + 30);
    return;
  }

  try {
    src.stop();
  } catch {
    // already stopped
  }
  try {
    src.disconnect();
  } catch {
    // already disconnected
  }
  try {
    gain.disconnect();
  } catch {
    // already disconnected
  }
}

/** Cymbal crash when the final total finishes counting. */
export function playTallyRevealDrumroll(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.95, 0, 1);
  if (tallyRevealDrumrollBuffer) {
    play(tallyRevealDrumrollBuffer);
    return;
  }
  void ensureTallyRevealDrumrollBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Orchestral hit when combo multiplier increases. Pitch scales with combo (2x = 1, 3x = 1.25, …). */
export function playComboLevelSound(comboLevel: number): void {
  const steps = Math.max(0, Math.floor(comboLevel) - 2);
  const rate = 1.25 ** steps;
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.8, 0, rate);
  if (comboLevelBuffer) {
    play(comboLevelBuffer);
    return;
  }
  void ensureComboLevelBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Lost-item sting when a combo streak resets. Faster + higher via 1.5× playback. */
export function playComboLostSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.3, 0, 1.5);
  if (comboLostBuffer) {
    play(comboLostBuffer);
    return;
  }
  void ensureComboLostBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Impact when the final total slams in. */
export function playTallyThudSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 1.05, 0, 1);
  if (tallyThudBuffer) {
    play(tallyThudBuffer);
    return;
  }
  void ensureTallyThudBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

/** Click for How To Play overlay buttons. */
export function playTutorialButtonSound(): void {
  const play = (buf: AudioBuffer) => playBuffer(buf, 0.9, 0, 1);
  if (tutorialSelectBuffer) {
    play(tutorialSelectBuffer);
    return;
  }

  void ensureTutorialSelectBuffer().then((buf) => {
    if (buf) play(buf);
  });
}

let menuButtonSfxInstalled = false;

/** Play UI click SFX: tutorial overlay, menus, HUD — not mode-start or reload. */
export function installMenuButtonSfx(): void {
  if (menuButtonSfxInstalled || typeof document === 'undefined') return;
  menuButtonSfxInstalled = true;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const control = el.closest('button, [role="button"]');
      if (!(control instanceof HTMLElement)) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      if (control.closest('.tut-coach')) {
        playTutorialButtonSound();
        return;
      }
      if (control.classList.contains('hud-reload-btn') || control.classList.contains('hud-ammo')) return;
      const mode = control.dataset.mode;
      if (mode === 'endless' || mode === 'timed') return;
      playMenuButtonSound();
    },
    true,
  );
}

/** Bubble pop sample when a bubble is shot — 2× pitch, alternating forward/reverse. */
export function playPopSound(): void {
  const play = (forward: AudioBuffer) => {
    const reverse = popReverseBuffer ?? reverseAudioBuffer(forward);
    if (reverse && !popReverseBuffer) popReverseBuffer = reverse;
    const buf = popPlayReverse && reverse ? reverse : forward;
    popPlayReverse = !popPlayReverse;
    playBuffer(buf, 0.2875, 0, BUBBLE_LOOP_RATE);
  };

  if (popBuffer) {
    play(popBuffer);
    return;
  }

  void ensurePopBuffer().then((buf) => {
    if (buf) play(buf);
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
