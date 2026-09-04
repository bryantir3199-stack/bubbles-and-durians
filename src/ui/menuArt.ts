/** Stack menu art as button → zigzag → mode icon → text. */

const TOP_ASPECT = 300 / 70;
const SIDE_ASPECT = 64 / 150;
const FRAME_SRC = '/assets/menu-button-frame.png';
const FRAME_SLICE = 32;
const FRAME_OVERLAP = 2.5;
const zigObservers = new WeakMap<HTMLElement, ResizeObserver>();
const skinObservers = new WeakMap<HTMLElement, ResizeObserver>();

let frameImage: HTMLImageElement | null = null;
let frameImageLoad: Promise<HTMLImageElement> | null = null;

function loadFrameImage(): Promise<HTMLImageElement> {
  if (frameImage?.naturalWidth) return Promise.resolve(frameImage);
  if (!frameImageLoad) {
    frameImageLoad = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        frameImage = img;
        resolve(img);
      };
      img.onerror = () => {
        frameImageLoad = null;
        reject(new Error('menu button frame failed to load'));
      };
      img.src = FRAME_SRC;
    });
  }
  return frameImageLoad;
}

function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  destBorder: number,
  overlap: number,
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const ss = FRAME_SLICE;
  const db = destBorder;
  const o = overlap;
  const srcCW = iw - 2 * ss;
  const srcCH = ih - 2 * ss;
  const dstCW = w - 2 * db;
  const dstCH = h - 2 * db;
  if (srcCW < 1 || srcCH < 1 || dstCW < 1 || dstCH < 1 || db < 1) return;

  ctx.clearRect(0, 0, w, h);

  // Center, then edges that overlap into the corners, then corners on top.
  ctx.drawImage(img, ss, ss, srcCW, srcCH, db - o, db - o, dstCW + 2 * o, dstCH + 2 * o);
  ctx.drawImage(img, ss, 0, srcCW, ss, db - o, 0, dstCW + 2 * o, db);
  ctx.drawImage(img, ss, ih - ss, srcCW, ss, db - o, h - db, dstCW + 2 * o, db);
  ctx.drawImage(img, 0, ss, ss, srcCH, 0, db - o, db, dstCH + 2 * o);
  ctx.drawImage(img, iw - ss, ss, ss, srcCH, w - db, db - o, db, dstCH + 2 * o);
  ctx.drawImage(img, 0, 0, ss, ss, 0, 0, db, db);
  ctx.drawImage(img, iw - ss, 0, ss, ss, w - db, 0, db, db);
  ctx.drawImage(img, 0, ih - ss, ss, ss, 0, h - db, db, db);
  ctx.drawImage(img, iw - ss, ih - ss, ss, ss, w - db, h - db, db, db);
}

function paintButtonSkin(btn: HTMLElement, wrap: HTMLElement): void {
  const canvas = wrap.querySelector('canvas');
  const img = frameImage;
  if (!canvas || !img?.naturalWidth) return;
  const destBorder = parseFloat(getComputedStyle(btn).borderTopWidth) || 0;
  if (destBorder < 1) return;
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW < 2 || cssH < 2 || cssW > 1600 || cssH > 1600) return;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawNineSlice(ctx, img, cssW, cssH, destBorder, FRAME_OVERLAP);
}

function watchButtonSkin(btn: HTMLElement, wrap: HTMLElement): void {
  const paint = () => paintButtonSkin(btn, wrap);
  void loadFrameImage().then(paint);
  if (skinObservers.has(wrap)) return;
  const ro = new ResizeObserver(paint);
  ro.observe(wrap);
  skinObservers.set(wrap, ro);
}

function ensureButtonSkin(btn: HTMLElement): void {
  let wrap = btn.querySelector<HTMLElement>('.menu-btn-skin');
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'menu-btn-skin';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.appendChild(document.createElement('canvas'));
  }
  // Last child: flex abspos as the first item gets the wrong containing block.
  btn.appendChild(wrap);
  watchButtonSkin(btn, wrap);
}

function wholeCount(available: number, natural: number): number {
  if (natural < 1) return 1;
  const n = Math.max(1, Math.round(available / natural));
  // Prefer fewer whole tiles over squashing an extra one until it looks clipped.
  if (n > 1 && available / n < natural * 0.78) return n - 1;
  return n;
}

function fitWholeTiles(el: HTMLElement, axis: 'x' | 'y', aspect: number): void {
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w < 1 || h < 1) return;
  if (axis === 'x') {
    const natural = h * aspect;
    const n = wholeCount(w, natural);
    el.style.backgroundSize = `${w / n}px 100%`;
    el.style.backgroundRepeat = 'repeat-x';
  } else {
    const natural = w / aspect;
    const n = wholeCount(h, natural);
    el.style.backgroundSize = `100% ${h / n}px`;
    el.style.backgroundRepeat = 'repeat-y';
  }
}

function layoutZigzag(z: HTMLElement): void {
  const t = z.querySelector<HTMLElement>('.menu-zig-t');
  const b = z.querySelector<HTMLElement>('.menu-zig-b');
  const l = z.querySelector<HTMLElement>('.menu-zig-l');
  const r = z.querySelector<HTMLElement>('.menu-zig-r');
  if (!t || !b || !l || !r) return;
  fitWholeTiles(t, 'x', TOP_ASPECT);
  fitWholeTiles(b, 'x', TOP_ASPECT);
  fitWholeTiles(l, 'y', SIDE_ASPECT);
  fitWholeTiles(r, 'y', SIDE_ASPECT);
}

function watchZigzag(z: HTMLElement): void {
  const layout = () => layoutZigzag(z);
  layout();
  if (zigObservers.has(z)) return;
  const ro = new ResizeObserver(layout);
  ro.observe(z);
  zigObservers.set(z, ro);
}

export function paintMenuArt(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.menu-tile, .menu.main-menu .menu-option').forEach((btn) => {
    if (!btn.querySelector('.menu-zigzag')) {
      const modeIcon = btn.querySelector('.menu-icon-mode');
      const nodes = [...btn.childNodes].filter((node) => {
        return !(node instanceof HTMLElement && node.classList.contains('menu-btn-skin'));
      });
      btn.replaceChildren();
      const zigzag = document.createElement('span');
      zigzag.className = 'menu-zigzag';
      zigzag.setAttribute('aria-hidden', 'true');
      zigzag.innerHTML =
        '<span class="menu-zig-fill"></span>' +
        '<span class="menu-zig-t"></span>' +
        '<span class="menu-zig-b"></span>' +
        '<span class="menu-zig-l"></span>' +
        '<span class="menu-zig-r"></span>' +
        '<span class="menu-zig-tl"></span>' +
        '<span class="menu-zig-tr"></span>' +
        '<span class="menu-zig-bl"></span>' +
        '<span class="menu-zig-br"></span>';
      btn.appendChild(zigzag);
      if (modeIcon) btn.appendChild(modeIcon);
      const label = document.createElement('span');
      label.className = 'menu-btn-label';
      nodes.forEach((node) => {
        if (node === modeIcon) return;
        label.appendChild(node);
      });
      btn.appendChild(label);
      requestAnimationFrame(() => watchZigzag(zigzag));
    }
    ensureButtonSkin(btn);
  });
}
