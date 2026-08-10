/**
 * Lightweight cartoon SFX via Web Audio (no asset files).
 */
let ctx: AudioContext | null = null;

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

/** Short cartoony “pew” / pop for shooting. */
export function playShootSound(): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;

  // Descending square “pew”
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + 0.15);

  // Soft noise click for cartoon punch
  const nLen = Math.floor(ac.sampleRate * 0.04);
  const buffer = ac.createBuffer(1, nLen, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < nLen; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / nLen);
  }
  const noise = ac.createBufferSource();
  const nGain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1200;
  filter.Q.value = 0.8;
  noise.buffer = buffer;
  nGain.gain.setValueAtTime(0.18, t0);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(ac.destination);
  noise.start(t0);
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
