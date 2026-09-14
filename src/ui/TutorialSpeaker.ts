import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { ModelCache } from '../world/ModelCache';

/** Play camera XZ — same as lawn / path facing. */
const CAM_X = 0;
const CAM_Z = 635;

/** Lawn in front of the keep, just left of the doors. Feet on the ground. */
const SPEAKER_X = -48;
const SPEAKER_Z = 148;

/**
 * Tutorial presenter — the teeth stand in the play world in front of the castle.
 * Same world size as other targets. Not a shootable target.
 */
export class TutorialSpeaker {
  readonly root: THREE.Group;
  private holder: THREE.Group;
  private teethOpen: THREE.Object3D | null = null;
  private teethClose: THREE.Object3D | null = null;
  private openState = false;
  private chompAge = 0;
  private talking = false;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'tutorial-speaker';
    this.holder = new THREE.Group();

    this.root.position.set(SPEAKER_X, gameConfig.targetSize * 0.5, SPEAKER_Z);
    this.faceCamera();
    this.root.add(this.holder);
    this.scene.add(this.root);

    this.buildTeeth();
  }

  setTalking(talking: boolean): void {
    this.talking = talking;
    if (!talking) {
      this.setClosed();
      return;
    }
    this.chompAge = 0;
    if (this.teethOpen && this.teethClose) {
      this.openState = true;
      this.teethOpen.visible = true;
      this.teethClose.visible = false;
    }
  }

  /** Mouth / eyes — where the speech tail starts. */
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    this.root.getWorldPosition(out);
    out.y += gameConfig.targetSize * 0.18;
    return out;
  }

  /** Lawn in front of the keep, between the presenter and the doors. */
  frontOfKeep(out: THREE.Vector3): THREE.Vector3 {
    this.root.getWorldPosition(out);
    out.x = 8;
    out.y += gameConfig.targetSize * 0.12;
    return out;
  }

  update(dt: number): void {
    if (!this.teethOpen || !this.teethClose) return;
    if (!this.talking) {
      this.setClosed();
      return;
    }

    this.chompAge += dt * 1000;
    if (this.chompAge >= gameConfig.teethChompIntervalMs) {
      this.chompAge = 0;
      this.openState = !this.openState;
      this.teethOpen.visible = this.openState;
      this.teethClose.visible = !this.openState;
    }
  }

  destroy(): void {
    this.root.removeFromParent();
  }

  private faceCamera(): void {
    const dx = CAM_X - this.root.position.x;
    const dz = CAM_Z - this.root.position.z;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  private buildTeeth(): void {
    if (!ModelCache.isReady) return;
    this.teethOpen = ModelCache.cloneModel('teethOpen');
    this.teethClose = ModelCache.cloneModel('teethClose');
    this.holder.add(this.teethOpen);
    this.holder.add(this.teethClose);
    this.setClosed();
  }

  /** Idle pose: mouth shut. */
  private setClosed(): void {
    if (!this.teethOpen || !this.teethClose) return;
    this.openState = false;
    this.chompAge = 0;
    this.teethOpen.visible = false;
    this.teethClose.visible = true;
  }
}
