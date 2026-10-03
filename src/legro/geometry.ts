import type { Axis, Normal, Pose, QuarterTurn, SocketDef, Yaw } from "./types.ts";

export type Vec = { x: number; y: number; z: number };

export function isQuarterTurn(value: number | undefined): value is QuarterTurn {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function isYaw(value: number): value is Yaw {
  return isQuarterTurn(value);
}

export function gradeOk(pose: Pose): boolean {
  return (
    Number.isInteger(pose.x) &&
    Number.isInteger(pose.y) &&
    Number.isInteger(pose.z) &&
    isYaw(pose.yaw) &&
    (pose.pitch === undefined || isQuarterTurn(pose.pitch)) &&
    (pose.roll === undefined || isQuarterTurn(pose.roll))
  );
}

/** Rotação em torno de Y. yaw 1: (x, z) → (z, −x). Mantida para compatibilidade. */
export function rotXZ(x: number, z: number, yaw: Yaw): { x: number; z: number } {
  switch (yaw) {
    case 0: return { x, z };
    case 1: return { x: z, z: -x };
    case 2: return { x: -x, z: -z };
    case 3: return { x: -z, z: x };
  }
}

function rotX(v: Vec, turn: QuarterTurn): Vec {
  switch (turn) {
    case 0: return v;
    case 1: return { x: v.x, y: -v.z, z: v.y };
    case 2: return { x: v.x, y: -v.y, z: -v.z };
    case 3: return { x: v.x, y: v.z, z: -v.y };
  }
}
function rotY(v: Vec, turn: QuarterTurn): Vec {
  const r = rotXZ(v.x, v.z, turn);
  return { x: r.x, y: v.y, z: r.z };
}
function rotZ(v: Vec, turn: QuarterTurn): Vec {
  switch (turn) {
    case 0: return v;
    case 1: return { x: -v.y, y: v.x, z: v.z };
    case 2: return { x: -v.x, y: -v.y, z: v.z };
    case 3: return { x: v.y, y: -v.x, z: v.z };
  }
}

/**
 * Orientação ortogonal determinística. A ordem é X (pitch), Y (yaw), Z (roll),
 * a mesma convenção usada pela cena. Só existem coordenadas inteiras.
 */
export function rotateVec(local: Vec, pose: Pick<Pose, "yaw" | "pitch" | "roll">): Vec {
  const pitch = pose.pitch ?? 0;
  const roll = pose.roll ?? 0;
  return rotZ(rotY(rotX(local, pitch), pose.yaw), roll);
}

const NORMAL_VEC: Record<Normal, Vec> = {
  "+x": { x: 1, y: 0, z: 0 }, "-x": { x: -1, y: 0, z: 0 },
  "+y": { x: 0, y: 1, z: 0 }, "-y": { x: 0, y: -1, z: 0 },
  "+z": { x: 0, y: 0, z: 1 }, "-z": { x: 0, y: 0, z: -1 },
};
function vecNormal(v: Vec): Normal {
  if (v.x === 1) return "+x"; if (v.x === -1) return "-x";
  if (v.y === 1) return "+y"; if (v.y === -1) return "-y";
  if (v.z === 1) return "+z"; return "-z";
}
const AXIS_VEC: Record<Axis, Vec> = {
  x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 },
};
function vecAxis(v: Vec): Axis {
  if (v.x !== 0) return "x";
  if (v.y !== 0) return "y";
  return "z";
}

export function rotNormal(normal: Normal, poseOrYaw: Pose | Yaw): Normal {
  const pose = typeof poseOrYaw === "number" ? { yaw: poseOrYaw } : poseOrYaw;
  return vecNormal(rotateVec(NORMAL_VEC[normal], pose));
}

export function rotAxis(axis: Axis, poseOrYaw: Pose | Yaw): Axis {
  const pose = typeof poseOrYaw === "number" ? { yaw: poseOrYaw } : poseOrYaw;
  return vecAxis(rotateVec(AXIS_VEC[axis], pose));
}

export function worldVec(local: Vec, pose: Pose): Vec {
  const r = rotateVec(local, pose);
  return { x: pose.x + r.x, y: pose.y + r.y, z: pose.z + r.z };
}

export function cellKey(v: Vec): string { return `${v.x},${v.y},${v.z}`; }

export function opposite(normal: Normal): Normal {
  switch (normal) {
    case "+x": return "-x"; case "-x": return "+x";
    case "+y": return "-y"; case "-y": return "+y";
    case "+z": return "-z"; case "-z": return "+z";
  }
}

export function step(normal: Normal): Vec { return NORMAL_VEC[normal]; }

export type WorldSocket = {
  instanceId: string;
  socketId: string;
  cadeira: 0 | 1 | 2;
  x: number; y: number; z: number;
  family: SocketDef["family"];
  gender: SocketDef["gender"];
  normal?: Normal;
  axis?: Axis;
  yaw: Yaw;
};

export function projectSocket(instanceId: string, cadeira: 0 | 1 | 2, socket: SocketDef, pose: Pose): WorldSocket {
  const at = worldVec(socket, pose);
  return {
    instanceId, socketId: socket.id, cadeira,
    x: at.x, y: at.y, z: at.z,
    family: socket.family, gender: socket.gender,
    normal: socket.normal ? rotNormal(socket.normal, pose) : undefined,
    axis: socket.axis ? rotAxis(socket.axis, pose) : undefined,
    yaw: pose.yaw,
  };
}
