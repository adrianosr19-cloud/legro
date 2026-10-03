import { CATALOG } from "./catalog.ts";
import type { CellDef, Pose } from "./types.ts";
import { rotateVec, type Vec } from "./geometry.ts";

/**
 * Unidade geométrica exata do LEGRO.
 * 1 stud = 5 micro-unidades; 1 placa de altura = 2.
 * Isso preserva a proporção visual 0,28 : 0,112 sem ponto flutuante.
 */
export const STUD_U = 5;
export const PLATE_U = 2;

export type MicroVec = Vec;
export type AabbU = { min: MicroVec; max: MicroVec };

function poseOriginU(pose: Pose): MicroVec {
  return { x: pose.x * STUD_U, y: pose.y * PLATE_U, z: pose.z * STUD_U };
}

function localPointU(x: number, y: number, z: number): MicroVec {
  return { x: x * STUD_U, y: y * PLATE_U, z: z * STUD_U };
}

function add(a: MicroVec, b: MicroVec): MicroVec {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Rotaciona primeiro no espaço físico inteiro e só depois translada. */
export function worldPointU(local: MicroVec, pose: Pose): MicroVec {
  return add(poseOriginU(pose), rotateVec(local, pose));
}

export function cellAabbU(cell: CellDef, pose: Pose): AabbU {
  const lo = localPointU(cell.x, cell.y, cell.z);
  const hi = localPointU(cell.x + 1, cell.y + 1, cell.z + 1);
  const corners: MicroVec[] = [];
  for (const x of [lo.x, hi.x]) for (const y of [lo.y, hi.y]) for (const z of [lo.z, hi.z]) {
    corners.push(worldPointU({ x, y, z }, pose));
  }
  return {
    min: {
      x: Math.min(...corners.map((p) => p.x)),
      y: Math.min(...corners.map((p) => p.y)),
      z: Math.min(...corners.map((p) => p.z)),
    },
    max: {
      x: Math.max(...corners.map((p) => p.x)),
      y: Math.max(...corners.map((p) => p.y)),
      z: Math.max(...corners.map((p) => p.z)),
    },
  };
}

/** Contato de face não é colisão; só volume compartilhado conta. */
export function aabbOverlaps(a: AabbU, b: AabbU): boolean {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

export type PieceCellAabbU = { kind: CellDef["kind"]; box: AabbU };

export function pieceCellAabbsU(defId: string, pose: Pose): PieceCellAabbU[] {
  return (CATALOG[defId]?.cells ?? []).map((cell) => ({ kind: cell.kind, box: cellAabbU(cell, pose) }));
}

export function pieceSolidAabbsU(defId: string, pose: Pose): AabbU[] {
  return pieceCellAabbsU(defId, pose).filter((cell) => cell.kind === "solido").map((cell) => cell.box);
}

export function piecesOverlapU(
  aDefId: string,
  aPose: Pose,
  bDefId: string,
  bPose: Pose,
): boolean {
  const a = pieceSolidAabbsU(aDefId, aPose);
  const b = pieceSolidAabbsU(bDefId, bPose);
  return a.some((left) => b.some((right) => aabbOverlaps(left, right)));
}
