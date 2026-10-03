import { CATALOG } from "./catalog.ts";
import { rotateVec, rotXZ, worldVec } from "./geometry.ts";
import { applyIntent } from "./reducer.ts";
import type { ApplyResult, PieceInstance, Pose, QuarterTurn, RejectReason, RoomState, Yaw } from "./types.ts";

/** Uma cadeira. A mesa do laboratório não abre as outras duas. */
export const LAB_CHAIR = 0 as const;

/** Escala só de desenho. A lei continua em studs e placas inteiros. */
export const STUD = 0.28;
export const PLATE = 0.112;

export const COR_HEX: Record<string, string> = {
  vermelho: "#c23b2e",
  azul: "#2a5fbf",
  amarelo: "#e2b427",
  verde: "#3d8a45",
  branco: "#f7f4ee",
  preto: "#2a2724",
  laranja: "#e07a2f",
  cinza: "#8d8478",
};

export const WOOD = "#b9895a";
export const PAPER = "#f3ecdf";
export const INK = "#241c16";
export const GHOST_OK = "#1f6b45";
export const GHOST_NO = "#8d342c";

const YAWS: readonly Yaw[] = [0, 1, 2, 3];

export function isYaw(value: number): value is Yaw {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function nextYaw(yaw: Yaw, direction: 1 | -1): Yaw {
  return YAWS[(yaw + direction + 4) % 4]!;
}

export function nextQuarterTurn(value: QuarterTurn | undefined, direction: 1 | -1): QuarterTurn {
  const current = value ?? 0;
  return ((current + direction + 4) % 4) as QuarterTurn;
}

/** Vira a peça 90° de verdade; a orientação passa a fazer parte da lei. */
export function tiltPiece(pose: Pose, axis: "x" | "z", direction: 1 | -1): Pose {
  return axis === "x"
    ? { ...pose, pitch: nextQuarterTurn(pose.pitch, direction) }
    : { ...pose, roll: nextQuarterTurn(pose.roll, direction) };
}

export type RotationOrder = "XYZ";

/**
 * A lei compõe vetores como X -> Y -> Z. Em Three.js isso corresponde
 * a Euler XYZ com os mesmos quartos de volta.
 */
export function poseRotationRadians(pose: Pose): [number, number, number, RotationOrder] {
  return [
    ((pose.pitch ?? 0) * Math.PI) / 2,
    (pose.yaw * Math.PI) / 2,
    ((pose.roll ?? 0) * Math.PI) / 2,
    "XYZ",
  ];
}

export type ScreenNudge = "esquerda" | "direita" | "cima" | "baixo";

/**
 * Um stud na direção da tela, não do eixo da mesa.
 * A câmera está do lado (sin turn, cos turn). Direita na tela segue o vetor (cos, −sin).
 */
export function nudgeOnScreen(turn: number, which: ScreenNudge): { x: number; z: number } {
  const s = Math.sin(turn);
  const c = Math.cos(turn);
  const right = { x: c, z: -s };
  const up = { x: -s, z: -c };
  const raw =
    which === "direita"
      ? right
      : which === "esquerda"
        ? { x: -right.x, z: -right.z }
        : which === "cima"
          ? up
          : { x: -up.x, z: -up.z };
  if (Math.abs(raw.x) >= Math.abs(raw.z)) return { x: raw.x >= 0 ? 1 : -1, z: 0 };
  return { x: 0, z: raw.z >= 0 ? 1 : -1 };
}

export function stepPose(pose: Pose, turn: number, which: ScreenNudge): Pose {
  const step = nudgeOnScreen(turn, which);
  return { ...pose, x: pose.x + step.x, z: pose.z + step.z };
}

function solidCells(defId: string): { x: number; y: number; z: number }[] {
  return (CATALOG[defId]?.cells ?? [])
    .filter((cell) => cell.kind !== "vazio")
    .map(({ x, y, z }) => ({ x, y, z }));
}

function average3D(cells: { x: number; y: number; z: number }[]): { x: number; y: number; z: number } {
  let x = 0, y = 0, z = 0;
  for (const cell of cells) { x += cell.x; y += cell.y; z += cell.z; }
  const count = cells.length || 1;
  return { x: x / count, y: y / count, z: z / count };
}

/**
 * Gira 90° em torno do Y mundial sem apagar pitch/roll.
 * O pivô é calculado usando a forma já orientada em 3D.
 */
export function spinPiece(defId: string, pose: Pose, sentido: "horario" | "antihorario"): Pose {
  const yaw = nextYaw(pose.yaw, sentido === "horario" ? -1 : 1);
  const local = solidCells(defId);
  if (local.length === 0) return { ...pose, yaw };

  const before = average3D(local.map((cell) => rotateVec(cell, pose)));
  const nextOrientation = { ...pose, yaw };
  const after = average3D(local.map((cell) => rotateVec(cell, nextOrientation)));
  const rawX = before.x - after.x;
  const rawZ = before.z - after.z;
  const onStud = Math.abs(rawX - Math.round(rawX)) < 1e-6 && Math.abs(rawZ - Math.round(rawZ)) < 1e-6;
  if (onStud) {
    return { ...pose, x: pose.x + Math.round(rawX), z: pose.z + Math.round(rawZ), yaw };
  }

  const mid = average3D(local);
  const pivot = local.reduce((best, cell) => {
    const dist = (cell.x - mid.x) ** 2 + (cell.y - mid.y) ** 2 + (cell.z - mid.z) ** 2;
    const bestDist = (best.x - mid.x) ** 2 + (best.y - mid.y) ** 2 + (best.z - mid.z) ** 2;
    if (dist < bestDist - 1e-9) return cell;
    if (
      Math.abs(dist - bestDist) <= 1e-9 &&
      (cell.x < best.x ||
        (cell.x === best.x && (cell.y < best.y || (cell.y === best.y && cell.z < best.z))))
    ) return cell;
    return best;
  });
  const oldP = rotateVec(pivot, pose);
  const newP = rotateVec(pivot, nextOrientation);
  return {
    ...pose,
    x: pose.x + oldP.x - newP.x,
    y: pose.y + oldP.y - newP.y,
    z: pose.z + oldP.z - newP.z,
    yaw,
  };
}

export function yawDegrees(yaw: Yaw): 0 | 90 | 180 | 270 {
  return (yaw * 90) as 0 | 90 | 180 | 270;
}

/** Radianos em torno de Y que reproduzem o yaw da lei no three.js. */
export function yawRadians(yaw: Yaw): number {
  return (yaw * Math.PI) / 2;
}

/**
 * Pose sugerida para o fantasma. Não valida encaixe.
 * O y devolvido é a altura em que a origem da peça sentaria na superfície sob o ponto.
 */
export function gridFromWorld(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const eps = 1e-4;
  return {
    x: Math.floor(x / STUD + eps),
    y: Math.floor((y - eps) / PLATE) + 1,
    z: Math.floor(z / STUD + eps),
  };
}

export function poseFromPoint(x: number, y: number, z: number, yaw: Yaw): Pose {
  const grid = gridFromWorld(x, y, z);
  return { x: grid.x, y: grid.y, z: grid.z, yaw };
}

/** Canto da célula, em metros, depois da mesma rotação da lei. */
export function visualCorner(local: { x: number; y: number; z: number }, pose: Pose): { x: number; y: number; z: number } {
  const r = rotateVec(local, pose);
  return {
    x: (pose.x + r.x) * STUD,
    y: (pose.y + r.y) * PLATE,
    z: (pose.z + r.z) * STUD,
  };
}

export function pegarPeca(state: RoomState, instanceId: string): ApplyResult {
  return applyIntent(state, {
    baseRevision: state.revision,
    intent: { type: "pegar", chair: LAB_CHAIR, instanceId },
  });
}

export function devolverPeca(state: RoomState, instanceId: string): ApplyResult {
  return applyIntent(state, {
    baseRevision: state.revision,
    intent: { type: "devolver", chair: LAB_CHAIR, instanceId },
  });
}

export function desmontarPeca(state: RoomState, instanceId: string): ApplyResult {
  return applyIntent(state, {
    baseRevision: state.revision,
    intent: { type: "desmontar", chair: LAB_CHAIR, instanceId },
  });
}

export function tentarEncaixe(state: RoomState, instanceId: string, pose: Pose): ApplyResult {
  return applyIntent(state, {
    baseRevision: state.revision,
    intent: { type: "encaixar", chair: LAB_CHAIR, instanceId, pose },
  });
}

/** Lê o redutor e descarta o estado. Passar o mouse não entra no histórico. */
export function lerPrevia(
  state: RoomState,
  instanceId: string,
  pose: Pose,
): { ok: true } | { ok: false; motivo: RejectReason } {
  const result = tentarEncaixe(state, instanceId, pose);
  if (result.ok) return { ok: true };
  return { ok: false, motivo: result.motivo };
}

export type BandejaItem = {
  defId: string;
  nome: string;
  cores: string[];
  count: number;
  sampleId: string;
};

export function bandeja(state: RoomState): BandejaItem[] {
  const groups = new Map<string, BandejaItem>();
  for (const piece of state.instances) {
    if (piece.holder !== "mesa" || piece.pose) continue;
    const key = `${piece.defId}:${piece.cor}`;
    const found = groups.get(key);
    if (found) {
      found.count += 1;
      if (!found.cores.includes(piece.cor)) found.cores.push(piece.cor);
      continue;
    }
    groups.set(key, {
      defId: piece.defId,
      nome: CATALOG[piece.defId]?.nome ?? piece.defId,
      cores: [piece.cor],
      count: 1,
      sampleId: piece.id,
    });
  }
  return [...groups.values()].sort((a, b) => a.nome.localeCompare(b.nome) || a.cores[0]!.localeCompare(b.cores[0]!));
}

export function mao(state: RoomState): PieceInstance[] {
  return state.instances
    .filter((piece) => piece.holder === LAB_CHAIR && piece.pose === null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function pecasNaMesa(state: RoomState): PieceInstance[] {
  return state.instances.filter((piece) => piece.pose !== null && piece.cadeira === LAB_CHAIR);
}

/** Confere que o canto desenhado cai no mesmo stud da lei. Usado no teste, não na cena. */
export function cornerMatchesLaw(local: { x: number; y: number; z: number }, pose: Pose): boolean {
  const law = worldVec(local, pose);
  const drawn = visualCorner(local, pose);
  const rotated = rotateVec(local, pose);
  return (
    rotated.x === law.x - pose.x &&
    rotated.y === law.y - pose.y &&
    rotated.z === law.z - pose.z &&
    Math.abs(drawn.x - law.x * STUD) < 1e-9 &&
    Math.abs(drawn.y - law.y * PLATE) < 1e-9 &&
    Math.abs(drawn.z - law.z * STUD) < 1e-9
  );
}
