import * as THREE from 'three';

const OPEN_ANGLE = Math.PI * 0.55;
const OPEN_SPEED = 2.2;

/**
 * Procedural swing for baked_door_l / baked_door_r (no bones in the GLB).
 */
export class DoorController {
  private openT = 0;
  private target = 0;
  private users = 0;
  private leftPivot: THREE.Group | null = null;
  private rightPivot: THREE.Group | null = null;

  setup(castleRoot: THREE.Object3D): void {
    let doorL: THREE.Mesh | null = null;
    let doorR: THREE.Mesh | null = null;
    castleRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === 'baked_door_l') doorL = obj;
      if (obj.name === 'baked_door_r') doorR = obj;
    });
    if (!doorL || !doorR) {
      console.warn('DoorController: door meshes not found');
      return;
    }

    castleRoot.updateMatrixWorld(true);
    // Outer vertical edges as hinges
    const boxL = new THREE.Box3().setFromObject(doorL);
    const boxR = new THREE.Box3().setFromObject(doorR);
    const hingeL = new THREE.Vector3(boxL.min.x, boxL.min.y, (boxL.min.z + boxL.max.z) * 0.5);
    const hingeR = new THREE.Vector3(boxR.max.x, boxR.min.y, (boxR.min.z + boxR.max.z) * 0.5);

    this.leftPivot = this.makePivot(doorL, hingeL);
    this.rightPivot = this.makePivot(doorR, hingeR);
  }

  private makePivot(door: THREE.Mesh, hingeWorld: THREE.Vector3): THREE.Group {
    const parent = door.parent;
    if (!parent) throw new Error('Door has no parent');
    parent.updateMatrixWorld(true);

    const pivot = new THREE.Group();
    pivot.name = `${door.name}_pivot`;
    parent.add(pivot);
    pivot.position.copy(parent.worldToLocal(hingeWorld.clone()));
    pivot.attach(door);
    return pivot;
  }

  retain(): void {
    this.users += 1;
    this.target = 1;
  }

  release(): void {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) this.target = 0;
  }

  get isOpenEnough(): boolean {
    return this.openT >= 0.85;
  }

  update(dt: number): void {
    if (!this.leftPivot || !this.rightPivot) return;
    if (Math.abs(this.target - this.openT) < 0.001) {
      this.openT = this.target;
    } else {
      const dir = Math.sign(this.target - this.openT);
      this.openT = THREE.MathUtils.clamp(this.openT + dir * OPEN_SPEED * dt, 0, 1);
    }
    this.leftPivot.rotation.y = -OPEN_ANGLE * this.openT;
    this.rightPivot.rotation.y = OPEN_ANGLE * this.openT;
  }
}

let instance: DoorController | null = null;

export function setDoorController(c: DoorController): void {
  instance = c;
}

export function getDoorController(): DoorController | null {
  return instance;
}
