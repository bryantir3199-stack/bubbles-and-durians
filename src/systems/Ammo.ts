import { gameConfig } from '../config/gameConfig';
import { playReloadShellSound } from '../audio/sfx';

type AmmoListener = (current: number, max: number, reloading: boolean) => void;

export class AmmoSystem {
  private ammo: number;
  private reloading = false;
  private reloadTimer: number | null = null;
  private listeners = new Set<AmmoListener>();
  /** Ammo count when the current reload began (for low→high pitch steps). */
  private reloadFrom = 0;

  constructor() {
    this.ammo = gameConfig.magazineSize;
  }

  get current(): number {
    return this.ammo;
  }

  get max(): number {
    return gameConfig.magazineSize;
  }

  get isReloading(): boolean {
    return this.reloading;
  }

  get isEmpty(): boolean {
    return this.ammo <= 0;
  }

  onChange(fn: AmmoListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.ammo, this.max, this.reloading);
  }

  canShoot(): boolean {
    return !this.reloading && this.ammo > 0;
  }

  tryShoot(): boolean {
    if (!this.canShoot()) return false;
    this.ammo -= 1;
    this.emit();
    return true;
  }

  tryReload(): boolean {
    if (this.reloading) return false;
    if (this.ammo >= gameConfig.magazineSize) return false;

    this.reloadFrom = this.ammo;
    this.reloading = true;
    this.emit();
    this.clearReloadTimer();
    this.scheduleNextShell();
    return true;
  }

  private scheduleNextShell(): void {
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null;
      if (this.ammo < gameConfig.magazineSize) {
        this.ammo += 1;
        const shellsToFill = gameConfig.magazineSize - this.reloadFrom;
        const step = this.ammo - this.reloadFrom; // 1..shellsToFill
        const progress01 = shellsToFill <= 1 ? 1 : (step - 1) / (shellsToFill - 1);
        playReloadShellSound(progress01);
        this.emit();
      }
      if (this.ammo >= gameConfig.magazineSize) {
        this.reloading = false;
        this.emit();
        return;
      }
      this.scheduleNextShell();
    }, gameConfig.reloadShellMs);
  }

  private clearReloadTimer(): void {
    if (this.reloadTimer != null) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  destroy(): void {
    this.clearReloadTimer();
    this.listeners.clear();
  }
}
