import type { Axis, Normal, Pose, SocketDef, Yaw } from "./types.ts";

export type Vec = { x: number; y: number; z: number };

export function isYaw(value: number): value is Yaw {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function gradeOk(pose: Pose): boolean {
  return (
    Number.isInteger(pose.x) &&
    Number.isInteger(pose.y) &&
    Number.isInteger(pose.z) &&
    isYaw(pose.yaw)
  );
}

/** Rotação em torno de Y. yaw 1: (x, z) → (z, −x). */
export function rotXZ(x: number, z: number, yaw: Yaw): { x: number; z: number } {
  switch (yaw) {
    case 0:
      return { x, z };
    case 1:
      return { x: z, z: -x };
    case 2:
      return { x: -x, z: -z };
    case 3:
      return { x: -z, z: x };
  }
}

const ROT_NORMAL: Record<Yaw, Record<Normal, Normal>> = {
  0: { "+x": "+x", "-x": "-x", "+y": "+y", "-y": "-y", "+z": "+z", "-z": "-z" },
  1: { "+x": "-z", "-x": "+z", "+y": "+y", "-y": "-y", "+z": "+x", "-z": "-x" },
  2: { "+x": "-x", "-x": "+x", "+y": "+y", "-y": "-y", "+z": "-z", "-z": "+z" },
  3: { "+x": "+z", "-x": "-z", "+y": "+y", "-y": "-y", "+z": "-x", "-z": "+x" },
};

export function rotNormal(normal: Normal, yaw: Yaw): Normal {
  return ROT_NORMAL[yaw][normal];
}

export function rotAxis(axis: Axis, yaw: Yaw): Axis {
  if (axis === "y") return "y";
  if (yaw === 0 || yaw === 2) return axis;
  return axis === "x" ? "z" : "x";
}

export function worldVec(local: Vec, pose: Pose): Vec {
  const xz = rotXZ(local.x, local.z, pose.yaw);
  return { x: pose.x + xz.x, y: pose.y + local.y, z: pose.z + xz.z };
}

export function cellKey(v: Vec): string {
  return `${v.x},${v.y},${v.z}`;
}

export function opposite(normal: Normal): Normal {
  switch (normal) {
    case "+x":
      return "-x";
    case "-x":
      return "+x";
    case "+y":
      return "-y";
    case "-y":
      return "+y";
    case "+z":
      return "-z";
    case "-z":
      return "+z";
  }
}

export function step(normal: Normal): Vec {
  switch (normal) {
    case "+x":
      return { x: 1, y: 0, z: 0 };
    case "-x":
      return { x: -1, y: 0, z: 0 };
    case "+y":
      return { x: 0, y: 1, z: 0 };
    case "-y":
      return { x: 0, y: -1, z: 0 };
    case "+z":
      return { x: 0, y: 0, z: 1 };
    case "-z":
      return { x: 0, y: 0, z: -1 };
  }
}

export type WorldSocket = {
  instanceId: string;
  socketId: string;
  cadeira: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
  family: SocketDef["family"];
  gender: SocketDef["gender"];
  normal?: Normal;
  axis?: Axis;
  yaw: Yaw;
};

export function projectSocket(
  instanceId: string,
  cadeira: 0 | 1 | 2,
  socket: SocketDef,
  pose: Pose,
): WorldSocket {
  const at = worldVec(socket, pose);
  return {
    instanceId,
    socketId: socket.id,
    cadeira,
    x: at.x,
    y: at.y,
    z: at.z,
    family: socket.family,
    gender: socket.gender,
    normal: socket.normal ? rotNormal(socket.normal, pose.yaw) : undefined,
    axis: socket.axis ? rotAxis(socket.axis, pose.yaw) : undefined,
    yaw: pose.yaw,
  };
}
