import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { Target } from '../entities/Target';
import { TutorialSpeaker } from './TutorialSpeaker';

export interface TutorialCoachContent {
  index: number;
  total: number;
  title: string;
  body: string;
  wait?: string;
  /** When false, CONTINUE is visible but greyed out. */
  continueEnabled: boolean;
  /** When false, BACK is visible but greyed out (first step). */
  backEnabled: boolean;
}

const TYPE_CPS = 52;
/** Screen gap from the teeth to the bubble — keeps the tail long. */
const TAIL_GAP = 96;
/** How far the pointy tip sits in front of the teeth (not on the mouth). */
const TIP_STANDOFF = 54;
const TAIL_CURVE = 48;
/** How far the wide end is tucked under the bubble. */
const BASE_ATTACH = 52;
const PLACE_LERP = 14;
/** Ignore this much overlap (px²) before an avoid rect counts. */
const AVOID_SLOP = 120;
/** Don't switch slots unless the new one is this much better. */
const PLACE_HYSTERESIS = 280;
const AVOID_PAD = 8;
const TEETH_PAD = 6;
/** Overlap with the presenter is never allowed. */
const TEETH_BLOCK = 1e7;

const HIGHLIGHT_RE =
  /\bgold durians?|\bgreen durians?|\bdurians?|\bbubbles\b|\bchomping teeth|\bhearts?|\bcombo\b|\bfrenzy\b|\blife\b|\blives\b|\bendless\b|\btimed\b/gi;

type Rect = { left: number; top: number; right: number; bottom: number };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightClass(match: string): string {
  const m = match.toLowerCase();
  if (m.startsWith('gold')) return 'tut-hl-gold';
  if (m.startsWith('bubble')) return 'tut-hl-bubble';
  if (m.includes('teeth')) return 'tut-hl-teeth';
  if (m.startsWith('heart')) return 'tut-hl-heart';
  if (m.startsWith('combo')) return 'tut-hl-combo';
  if (m.startsWith('frenzy')) return 'tut-hl-frenzy';
  if (m.startsWith('life')) return 'tut-hl-life';
  if (m.startsWith('endless') || m.startsWith('timed')) return 'tut-hl-mode';
  return 'tut-hl-durian';
}

function formatBody(text: string): string {
  return escapeHtml(text).replace(HIGHLIGHT_RE, (m) => `<span class="${highlightClass(m)}">${m}</span>`);
}

function inflate(r: Rect, pad: number): Rect {
  return {
    left: r.left - pad,
    top: r.top - pad,
    right: r.right + pad,
    bottom: r.bottom + pad,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function fromDom(el: DOMRect): Rect {
  return { left: el.left, top: el.top, right: el.right, bottom: el.bottom };
}

/** First hit of a ray against an axis-aligned rect, or null. */
function rayHitRect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  r: Rect,
): { x: number; y: number } | null {
  let tMin = 0;
  let tMax = 1e6;
  if (Math.abs(dx) < 1e-6) {
    if (ox < r.left || ox > r.right) return null;
  } else {
    let t1 = (r.left - ox) / dx;
    let t2 = (r.right - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (Math.abs(dy) < 1e-6) {
    if (oy < r.top || oy > r.bottom) return null;
  } else {
    let t1 = (r.top - oy) / dy;
    let t2 = (r.bottom - oy) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (tMin < 0) return null;
  return { x: ox + dx * tMin, y: oy + dy * tMin };
}

export class TutorialCoach {
  private root: HTMLElement;
  private dialogueEl: HTMLElement;
  private kickerEl: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private waitEl: HTMLElement;
  private caretEl: HTMLElement;
  private typeCursorEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private tailSvg: SVGSVGElement;
  private tailPath: SVGPathElement;
  private nextBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private speaker: TutorialSpeaker;
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly ndc = new THREE.Vector3();
  private readonly world = new THREE.Vector3();

  private fullBody = '';
  private typedLen = 0;
  private typeCarry = 0;
  private typed = false;
  private stepContinue = false;
  private queuedWait = '';
  private placed = false;
  private curX = 0;
  private curY = 0;
  private slotX = 0;
  private slotY = 0;

  constructor(
    parent: HTMLElement,
    private readonly opts: {
      scene: THREE.Scene;
      camera: THREE.Camera;
      canvas: HTMLCanvasElement;
      getTargets: () => Target[];
      onSkip: () => void;
      onQuit: () => void;
      onBack: () => void;
      onContinue: () => void;
    },
  ) {
    this.camera = opts.camera;
    this.canvas = opts.canvas;
    this.root = document.createElement('div');
    this.root.className = 'tut-coach';
    this.root.innerHTML = `
      <svg class="tut-tail" aria-hidden="true">
        <path class="tut-tail-shape" />
      </svg>
      <div class="tut-dialogue">
        <div class="tut-bubble">
          <div class="tut-bubble-head">
            <span class="tut-kicker">HOW TO PLAY</span>
            <div class="tut-actions">
              <button type="button" class="tut-btn tut-skip">SKIP</button>
              <button type="button" class="tut-btn tut-quit">MENU</button>
            </div>
          </div>
          <h2 class="tut-title"></h2>
          <p class="tut-body" aria-live="polite">
            <span class="tut-body-text"></span><span class="tut-type-cursor" aria-hidden="true">▌</span>
          </p>
          <p class="tut-wait" hidden></p>
          <span class="tut-caret" hidden aria-hidden="true">▼</span>
          <div class="tut-nav">
            <button type="button" class="tut-btn tut-back is-disabled" disabled>BACK</button>
            <button type="button" class="tut-btn tut-next is-disabled" disabled>CONTINUE</button>
          </div>
        </div>
      </div>
    `;
    parent.appendChild(this.root);

    this.tailSvg = this.root.querySelector('.tut-tail')!;
    this.tailPath = this.root.querySelector('.tut-tail-shape')!;
    this.dialogueEl = this.root.querySelector('.tut-dialogue')!;
    this.kickerEl = this.root.querySelector('.tut-kicker')!;
    this.titleEl = this.root.querySelector('.tut-title')!;
    this.bodyEl = this.root.querySelector('.tut-body-text')!;
    this.typeCursorEl = this.root.querySelector('.tut-type-cursor')!;
    this.waitEl = this.root.querySelector('.tut-wait')!;
    this.caretEl = this.root.querySelector('.tut-caret')!;
    this.bubbleEl = this.root.querySelector('.tut-bubble')!;
    this.backBtn = this.root.querySelector('.tut-back')!;
    this.nextBtn = this.root.querySelector('.tut-next')!;

    this.speaker = new TutorialSpeaker(opts.scene);
    this.layoutUi(0);

    this.bind(this.root.querySelector('.tut-skip')!, () => this.opts.onSkip());
    this.bind(this.root.querySelector('.tut-quit')!, () => this.opts.onQuit());
    this.bind(this.backBtn, () => {
      if (this.backBtn.disabled) return;
      this.opts.onBack();
    });
    this.bind(this.nextBtn, () => {
      if (this.nextBtn.disabled) return;
      this.opts.onContinue();
    });

    this.bubbleEl.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!this.typed) {
        this.completeType();
        return;
      }
      if (this.stepContinue) this.opts.onContinue();
    });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  set(content: TutorialCoachContent): void {
    this.kickerEl.textContent = `HOW TO PLAY · ${content.index} / ${content.total}`;
    this.titleEl.textContent = content.title;
    this.fullBody = content.body;
    this.typedLen = 0;
    this.typeCarry = 0;
    this.typed = false;
    this.queuedWait = content.wait ?? '';
    this.stepContinue = content.continueEnabled;
    this.bodyEl.innerHTML = '';
    this.typeCursorEl.hidden = false;
    this.caretEl.hidden = true;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    this.waitEl.hidden = true;
    this.waitEl.textContent = '';
    this.speaker.setTalking(true);
    this.setBackEnabled(content.backEnabled);
    this.syncContinue();
    if (!this.fullBody) this.completeType();
  }

  update(dt: number): void {
    this.speaker.update(dt);
    this.layoutUi(dt);
    if (this.typed || !this.fullBody) return;

    this.typeCarry += dt * TYPE_CPS;
    let add = Math.floor(this.typeCarry);
    if (add <= 0) return;
    this.typeCarry -= add;

    while (add > 0 && this.typedLen < this.fullBody.length) {
      const ch = this.fullBody[this.typedLen]!;
      this.typedLen += 1;
      add -= 1;
      if (ch === '.' || ch === '!' || ch === '?') this.typeCarry -= 0.12;
      else if (ch === ',') this.typeCarry -= 0.05;
    }

    this.bodyEl.innerHTML = formatBody(this.fullBody.slice(0, this.typedLen));
    if (this.typedLen >= this.fullBody.length) this.completeType();
  }

  setBackEnabled(enabled: boolean): void {
    this.backBtn.disabled = !enabled;
    this.backBtn.classList.toggle('is-disabled', !enabled);
    this.backBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  setContinueEnabled(enabled: boolean): void {
    this.stepContinue = enabled;
    this.syncContinue();
  }

  setWait(text: string): void {
    this.queuedWait = '';
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
  }

  feedback(text: string, kind: 'ok' | 'warn'): void {
    this.queuedWait = '';
    this.waitEl.hidden = false;
    this.waitEl.textContent = text;
    this.waitEl.classList.remove('tut-ok', 'tut-warn');
    this.waitEl.classList.add(kind === 'ok' ? 'tut-ok' : 'tut-warn');
  }

  destroy(): void {
    this.speaker.destroy();
    this.root.remove();
  }

  private layoutUi(dt: number): void {
    this.speaker.mouthWorld(this.world);
    const teeth = this.project(this.world.x, this.world.y, this.world.z);
    if (!teeth) {
      this.tailPath.setAttribute('d', '');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const pad = 10;
    const w = Math.max(160, this.dialogueEl.offsetWidth || 300);
    const h = Math.max(80, this.dialogueEl.offsetHeight || 160);
    const body = this.speakerScreen() ?? {
      left: teeth.x - 36,
      top: teeth.y - 36,
      right: teeth.x + 36,
      bottom: teeth.y + 48,
    };
    const avoid = this.collectAvoid(rect, body);

    const minL = rect.left + pad;
    const maxL = rect.right - pad - w;
    const minT = rect.top + pad;
    const hudTop = rect.bottom - rect.height * 0.14;
    const maxT = Math.min(rect.bottom - pad - h, hudTop - h - 8);
    const slots = this.placementSlots(teeth, body, w, h);

    const scoreBox = (box: Rect, prefer: number): number => {
      let score = prefer;
      if (overlapArea(box, inflate(body, TEETH_PAD)) > 0) score += TEETH_BLOCK;
      if (box.top + h * 0.45 > body.bottom) score -= 18;
      else if (box.top > teeth.y - 8) score -= 8;
      for (const a of avoid) {
        const o = overlapArea(box, a.rect);
        if (o > AVOID_SLOP) score += o * a.weight;
      }
      return score;
    };

    let best = { left: minL, top: minT };
    let bestScore = Infinity;
    for (const slot of slots) {
      let left = Math.min(maxL, Math.max(minL, slot.left));
      let top = Math.min(maxT, Math.max(minT, slot.top));
      let box: Rect = { left, top, right: left + w, bottom: top + h };
      if (overlapArea(box, inflate(body, TEETH_PAD)) > 0) {
        const nudged = this.nudgeOffTeeth(box, body, w, h, minL, maxL, minT, maxT);
        left = nudged.left;
        top = nudged.top;
        box = { left, top, right: left + w, bottom: top + h };
      }
      const score = scoreBox(box, slot.prefer);
      if (score < bestScore) {
        bestScore = score;
        best = { left, top };
      }
    }

    if (this.placed) {
      const heldLeft = Math.min(maxL, Math.max(minL, this.slotX));
      const heldTop = Math.min(maxT, Math.max(minT, this.slotY));
      const held: Rect = {
        left: heldLeft,
        top: heldTop,
        right: heldLeft + w,
        bottom: heldTop + h,
      };
      const heldScore = scoreBox(held, 12);
      const coversTeeth = overlapArea(held, inflate(body, TEETH_PAD)) > 0;
      if (!coversTeeth && heldScore <= bestScore + PLACE_HYSTERESIS) {
        best = { left: heldLeft, top: heldTop };
      }
    }

    this.slotX = best.left;
    this.slotY = best.top;

    if (!this.placed) {
      this.curX = best.left;
      this.curY = best.top;
      this.placed = true;
    } else {
      const k = 1 - Math.exp(-PLACE_LERP * Math.max(0, dt));
      this.curX += (best.left - this.curX) * k;
      this.curY += (best.top - this.curY) * k;
    }

    const shown: Rect = {
      left: this.curX,
      top: this.curY,
      right: this.curX + w,
      bottom: this.curY + h,
    };
    if (overlapArea(shown, inflate(body, TEETH_PAD)) > 0) {
      const snap = this.nudgeOffTeeth(shown, body, w, h, minL, maxL, minT, maxT);
      this.curX = snap.left;
      this.curY = snap.top;
    }

    this.dialogueEl.style.left = `${this.curX}px`;
    this.dialogueEl.style.top = `${this.curY}px`;
    this.dialogueEl.style.transform = 'none';
    this.drawTail(teeth.x, teeth.y);
  }

  /** Candidate bubble positions. Lower `prefer` = more “in front of the teeth”. */
  private placementSlots(
    mouth: { x: number; y: number },
    body: Rect,
    w: number,
    h: number,
  ): { prefer: number; left: number; top: number }[] {
    const gap = TAIL_GAP;
    const frontClear = TIP_STANDOFF + 80;
    const frontTop = body.top + (body.bottom - body.top) * 0.2;
    const belowTop = body.bottom + 20;
    return [
      { prefer: 0, left: body.right + frontClear, top: frontTop },
      { prefer: 6, left: body.left - w - frontClear, top: frontTop },
      { prefer: 10, left: body.right + 24, top: belowTop },
      { prefer: 14, left: body.left - w - 24, top: belowTop },
      { prefer: 28, left: mouth.x - w / 2, top: belowTop + gap * 0.1 },
      { prefer: 36, left: body.right + gap * 0.45, top: mouth.y - h * 0.55 },
      { prefer: 42, left: body.left - w - gap * 0.45, top: mouth.y - h * 0.55 },
      { prefer: 80, left: mouth.x - w / 2, top: body.top - h - 24 },
      { prefer: 88, left: body.right + 16, top: body.top - h - 12 },
      { prefer: 94, left: body.left - w - 16, top: body.top - h - 12 },
    ];
  }

  private nudgeOffTeeth(
    box: Rect,
    body: Rect,
    w: number,
    h: number,
    minL: number,
    maxL: number,
    minT: number,
    maxT: number,
  ): { left: number; top: number } {
    const cx = (box.left + box.right) / 2;
    const tcx = (body.left + body.right) / 2;
    let left = cx >= tcx ? body.right + TEETH_PAD + 8 : body.left - w - TEETH_PAD - 8;
    let top = box.top;
    if (overlapArea({ left, top, right: left + w, bottom: top + h }, inflate(body, TEETH_PAD)) > 0) {
      top = body.bottom + TEETH_PAD + 8;
    }
    return {
      left: Math.min(maxL, Math.max(minL, left)),
      top: Math.min(maxT, Math.max(minT, top)),
    };
  }

  private speakerScreen(): Rect | null {
    const size = gameConfig.targetSize;
    const c = this.project(this.world.x, this.world.y, this.world.z);
    const side = this.project(this.world.x + size * 0.5, this.world.y, this.world.z);
    const up = this.project(this.world.x, this.world.y + size * 0.5, this.world.z);
    if (!c) return null;
    const rx = side ? Math.abs(side.x - c.x) : 28;
    const ry = up ? Math.abs(up.y - c.y) : 32;
    const r = Math.max(22, Math.max(rx, ry) * 0.95);
    return {
      left: c.x - r,
      top: c.y - r * 0.85,
      right: c.x + r,
      bottom: c.y + r * 1.15,
    };
  }

  private collectAvoid(canvas: DOMRect, teethBody: Rect): { rect: Rect; weight: number }[] {
    const out: { rect: Rect; weight: number }[] = [];
    out.push({ rect: inflate(teethBody, TEETH_PAD), weight: 40 });
    for (const t of this.opts.getTargets()) {
      if (!t.active) continue;
      if (t.kind === 'teeth' && !t.isTeethVisuallyExposed()) continue;
      const tSize = t.kind === 'heart' ? gameConfig.heartSize : gameConfig.targetSize;
      const c = this.project(t.position.x, t.position.y, t.position.z);
      const top = this.project(t.position.x, t.position.y + tSize * 0.55, t.position.z);
      if (!c || !top) continue;
      const tr = Math.max(24, Math.abs(top.y - c.y) * 1.15);
      out.push({
        rect: inflate({ left: c.x - tr, top: c.y - tr, right: c.x + tr, bottom: c.y + tr }, AVOID_PAD),
        weight: 6,
      });
    }
    for (const el of document.querySelectorAll<HTMLElement>('.tut-arrow')) {
      if (el.hidden) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      out.push({ rect: inflate(fromDom(b), 8), weight: 6 });
    }
    out.push({
      rect: {
        left: canvas.left,
        top: canvas.bottom - canvas.height * 0.12,
        right: canvas.right,
        bottom: canvas.bottom,
      },
      weight: 1.1,
    });
    return out;
  }

  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    this.ndc.set(x, y, z).project(this.camera);
    if (this.ndc.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (this.ndc.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-this.ndc.y * 0.5 + 0.5) * rect.height,
    };
  }

  private drawTail(tx: number, ty: number): void {
    const box = this.bubbleEl.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) {
      this.tailPath.setAttribute('d', '');
      return;
    }

    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const dx = cx - tx;
    const dy = cy - ty;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const hit = rayHitRect(tx, ty, nx, ny, fromDom(box));
    const hx = hit?.x ?? cx;
    const hy = hit?.y ?? cy;
    // Wide end is buried well inside the bubble so the join is hidden.
    const bx = hx + nx * BASE_ATTACH;
    const by = hy + ny * BASE_ATTACH;
    // Pointy tip floats in front of the teeth, toward the bubble.
    const tipX = tx + nx * TIP_STANDOFF;
    const tipY = ty + ny * TIP_STANDOFF;

    const px = -ny;
    const py = nx;
    const base = 22;
    const midLen = Math.hypot(tipX - bx, tipY - by) || 1;
    const dirx = (tipX - bx) / midLen;
    const diry = (tipY - by) / midLen;
    const h = midLen * 0.34;
    const bow = Math.min(TAIL_CURVE, midLen * 0.22);
    const p1x = bx + dirx * h + px * bow;
    const p1y = by + diry * h + py * bow;
    const p2x = tipX - dirx * h + px * bow;
    const p2y = tipY - diry * h + py * bow;

    const STEPS = 18;
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    let minX = tipX;
    let minY = tipY;
    let maxX = tipX;
    let maxY = tipY;
    const grow = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const u = 1 - t;
      const u2 = u * u;
      const t2 = t * t;
      const x = u2 * u * bx + 3 * u2 * t * p1x + 3 * u * t2 * p2x + t2 * t * tipX;
      const y = u2 * u * by + 3 * u2 * t * p1y + 3 * u * t2 * p2y + t2 * t * tipY;
      const dxs =
        3 * u2 * (p1x - bx) + 6 * u * t * (p2x - p1x) + 3 * t2 * (tipX - p2x);
      const dys =
        3 * u2 * (p1y - by) + 6 * u * t * (p2y - p1y) + 3 * t2 * (tipY - p2y);
      const sl = Math.hypot(dxs, dys) || 1;
      const ox = -dys / sl;
      const oy = dxs / sl;
      const w = base * u ** 0.7;
      const lx = x + ox * w;
      const ly = y + oy * w;
      const rx = x - ox * w;
      const ry = y - oy * w;
      left.push({ x: lx, y: ly });
      right.push({ x: rx, y: ry });
      grow(lx, ly);
      grow(rx, ry);
    }

    const pad = 20;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const svgW = Math.max(8, maxX - minX);
    const svgH = Math.max(8, maxY - minY);
    this.tailSvg.style.left = `${minX}px`;
    this.tailSvg.style.top = `${minY}px`;
    this.tailSvg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    this.tailSvg.setAttribute('width', `${svgW}`);
    this.tailSvg.setAttribute('height', `${svgH}`);

    const p = (pt: { x: number; y: number }) => `${(pt.x - minX).toFixed(1)} ${(pt.y - minY).toFixed(1)}`;
    let d = `M ${p(left[0]!)}`;
    for (let i = 1; i < left.length; i++) d += ` L ${p(left[i]!)}`;
    for (let i = right.length - 2; i >= 0; i--) d += ` L ${p(right[i]!)}`;
    d += ' Z';
    this.tailPath.setAttribute('d', d);
  }

  private completeType(): void {
    if (this.typed) return;
    this.typed = true;
    this.typedLen = this.fullBody.length;
    this.bodyEl.innerHTML = formatBody(this.fullBody);
    this.typeCursorEl.hidden = true;
    this.speaker.setTalking(false);
    if (this.queuedWait) {
      this.waitEl.hidden = false;
      this.waitEl.textContent = this.queuedWait;
      this.queuedWait = '';
    }
    this.syncContinue();
  }

  private syncContinue(): void {
    const enabled = this.stepContinue && this.typed;
    this.nextBtn.disabled = !enabled;
    this.nextBtn.classList.toggle('is-disabled', !enabled);
    this.nextBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    this.caretEl.hidden = !enabled;
  }

  private bind(el: HTMLElement, fn: () => void): void {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }
}
