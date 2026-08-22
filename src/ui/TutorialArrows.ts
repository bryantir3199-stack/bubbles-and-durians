import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { Target } from '../entities/Target';

export type HudPart =
  | 'ammo'
  | 'combo'
  | 'lives'
  | 'frenzy'
  | 'pause'
  | 'mute'
  | 'reload'
  | 'score';

export type ArrowSpec = { kind: 'target' } | { kind: 'hud'; part: HudPart };

const ARROW_SVG = `<svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 76 4 36h18V6h20v30h18z" fill="currentColor" stroke="#1a1018" stroke-width="4" stroke-linejoin="round"/></svg>`;

/**
 * Screen-space tutorial pointers. World arrows follow the live target;
 * HUD arrows sit on ammo, combo, lives, Frenzy, pause, and mute.
 */
export class TutorialArrows {
  private specs: ArrowSpec[] = [];
  private nodes: HTMLElement[] = [];
  private raf = 0;
  private ticking = false;
  private ndc = new THREE.Vector3();

  constructor(
    private readonly opts: {
      camera: THREE.Camera;
      canvas: HTMLCanvasElement;
      getTarget: () => Target | null;
      getHudPart: (part: HudPart) => HTMLElement | null;
    },
  ) {}

  set(specs: ArrowSpec[]): void {
    this.specs = specs;
    this.ensureNodes(specs.length);
    if (specs.length === 0) {
      this.stop();
      return;
    }
    if (!this.ticking) {
      this.ticking = true;
      this.tick();
    } else {
      this.sync();
    }
  }

  destroy(): void {
    this.set([]);
    for (const n of this.nodes) n.remove();
    this.nodes = [];
  }

  private ensureNodes(count: number): void {
    while (this.nodes.length < count) {
      const el = document.createElement('div');
      el.className = 'tut-arrow';
      el.innerHTML = `<div class="tut-arrow-bob">${ARROW_SVG}</div>`;
      el.hidden = true;
      document.body.appendChild(el);
      this.nodes.push(el);
    }
    for (let i = count; i < this.nodes.length; i++) this.nodes[i]!.hidden = true;
  }

  private tick = (): void => {
    if (!this.ticking) return;
    this.sync();
    this.raf = requestAnimationFrame(this.tick);
  };

  private stop(): void {
    this.ticking = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const n of this.nodes) n.hidden = true;
  }

  private sync(): void {
    for (let i = 0; i < this.specs.length; i++) {
      const spec = this.specs[i]!;
      const el = this.nodes[i]!;
      if (spec.kind === 'target') this.placeOnTarget(el);
      else this.placeOnHud(el, spec.part);
    }
  }

  private placeOnTarget(el: HTMLElement): void {
    const target = this.opts.getTarget();
    if (!target) {
      el.hidden = true;
      return;
    }
    const size = target.kind === 'heart' ? gameConfig.heartSize : gameConfig.targetSize;
    this.ndc.set(target.position.x, target.position.y + size * 0.55, target.position.z);
    this.ndc.project(this.opts.camera);
    if (this.ndc.z > 1) {
      el.hidden = true;
      return;
    }
    const rect = this.opts.canvas.getBoundingClientRect();
    const x = rect.left + (this.ndc.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-this.ndc.y * 0.5 + 0.5) * rect.height;
    this.place(el, x, y);
  }

  private placeOnHud(el: HTMLElement, part: HudPart): void {
    const hud = this.opts.getHudPart(part);
    if (!hud || hud.hidden) {
      el.hidden = true;
      return;
    }
    const r = hud.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) {
      el.hidden = true;
      return;
    }
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fromBelow = y < window.innerHeight * 0.34;
    this.place(el, x, fromBelow ? r.bottom : r.top, fromBelow);
  }

  private place(el: HTMLElement, x: number, y: number, forceFromBelow?: boolean): void {
    const pad = 28;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const on =
      x >= pad && x <= vw - pad && y >= pad && y <= vh - pad;

    if (!on) {
      const cx = Math.min(vw - pad, Math.max(pad, x));
      const cy = Math.min(vh - pad, Math.max(pad, y));
      const rot = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      el.classList.add('is-edge');
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
      el.hidden = false;
      return;
    }

    const fromBelow = forceFromBelow ?? y < vh * 0.32;
    el.classList.remove('is-edge');
    el.style.left = `${x}px`;
    if (fromBelow) {
      el.style.top = `${y + 8}px`;
      el.style.transform = 'translate(-50%, 0) rotate(180deg)';
    } else {
      el.style.top = `${y - 8}px`;
      el.style.transform = 'translate(-50%, -100%)';
    }
    el.hidden = false;
  }
}
