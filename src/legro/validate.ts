import { baseId, CATALOG } from "./catalog.ts";
import {
  cellKey,
  gradeOk,
  opposite,
  projectSocket,
  step,
  worldVec,
  type WorldSocket,
} from "./geometry.ts";
import type { Chair, Connection, PieceInstance, Pose, RejectReason, RoomState } from "./types.ts";

export type PlacementOk = { ok: true; connections: Connection[] };
export type PlacementNo = { ok: false; motivo: RejectReason };
export type PlacementResult = PlacementOk | PlacementNo;

type Occupant = {
  instanceId: string;
  kind: "solido" | "vazio" | "tunel";
  cadeira: Chair;
};

type Mating = {
  a: WorldSocket;
  b: WorldSocket;
};

function socketOf(mating: Mating, gender: WorldSocket["gender"]): WorldSocket | null {
  if (mating.a.gender === gender) return mating.a;
  if (mating.b.gender === gender) return mating.b;
  return null;
}

function pairMates(a: WorldSocket, b: WorldSocket): boolean {
  if (a.instanceId === b.instanceId) return false;
  if (a.family !== b.family) return false;

  if (a.family === "bloco") {
    const stud = a.gender === "pino" ? a : b.gender === "pino" ? b : null;
    const anti = a.gender === "cavidade" ? a : b.gender === "cavidade" ? b : null;
    if (!stud || !anti || !stud.normal || !anti.normal) return false;
    if (stud.normal !== opposite(anti.normal)) return false;
    const d = step(stud.normal);
    return anti.x === stud.x + d.x && anti.y === stud.y + d.y && anti.z === stud.z + d.z;
  }

  if (a.family === "eixo") {
    if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
    if (!a.axis || a.axis !== b.axis) return false;
    const genders = new Set([a.gender, b.gender]);
    return (
      (genders.has("eixo") && genders.has("furo")) || (genders.has("eixo") && genders.has("cubo"))
    );
  }

  if (a.family === "dobradica") {
    if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return false;
    if (a.axis !== "y" || b.axis !== "y") return false;
    const genders = new Set([a.gender, b.gender]);
    if (!genders.has("folhaA") || !genders.has("folhaB")) return false;
    const delta = (b.yaw - a.yaw + 4) % 4;
    const ordered = a.gender === "folhaA" ? delta : (a.yaw - b.yaw + 4) % 4;
    return ordered === 0 || ordered === 1 || ordered === 3;
  }

  return false;
}

function matingKey(m: Mating): string {
  const left = `${m.a.instanceId}:${m.a.socketId}`;
  const right = `${m.b.instanceId}:${m.b.socketId}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function toConnection(m: Mating): Connection {
  const left = { instanceId: m.a.instanceId, socketId: m.a.socketId };
  const right = { instanceId: m.b.instanceId, socketId: m.b.socketId };
  const swap =
    left.instanceId > right.instanceId ||
    (left.instanceId === right.instanceId && left.socketId > right.socketId);
  return swap ? { a: right, b: left } : { a: left, b: right };
}

function occupancy(state: RoomState, ignoreId: string): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const piece of state.instances) {
    if (!piece.pose || piece.id === ignoreId || piece.cadeira === null) continue;
    const def = CATALOG[piece.defId];
    if (!def) continue;
    for (const cell of def.cells) {
      const at = worldVec(cell, piece.pose);
      map.set(cellKey(at), {
        instanceId: piece.id,
        kind: cell.kind,
        cadeira: piece.cadeira,
      });
    }
  }
  return map;
}

function placedSockets(state: RoomState, ignoreId: string): WorldSocket[] {
  const sockets: WorldSocket[] = [];
  for (const piece of state.instances) {
    if (!piece.pose || piece.id === ignoreId || piece.cadeira === null) continue;
    const def = CATALOG[piece.defId];
    if (!def) continue;
    for (const socket of def.sockets) {
      sockets.push(projectSocket(piece.id, piece.cadeira, socket, piece.pose));
    }
  }
  return sockets;
}

function axleHubAdjacent(
  matings: Mating[],
  cell: { x: number; y: number; z: number },
  belowId: string,
  selfId: string,
): boolean {
  return matings.some((m) => {
    const hub = socketOf(m, "cubo");
    const axle = socketOf(m, "eixo");
    if (!hub || !axle) return false;
    if (hub.instanceId !== selfId || axle.instanceId !== belowId) return false;
    const dx = Math.abs(cell.x - hub.x);
    const dy = Math.abs(cell.y - hub.y);
    const dz = Math.abs(cell.z - hub.z);
    return dx + dy + dz === 1;
  });
}

function verticalBrickContact(
  matings: Mating[],
  cell: { x: number; y: number; z: number },
  belowId: string,
  selfId: string,
): boolean {
  return matings.some((m) => {
    const stud = socketOf(m, "pino");
    const anti = socketOf(m, "cavidade");
    if (!stud || !anti || stud.normal !== "+y" || anti.normal !== "-y") return false;
    return (
      stud.instanceId === belowId &&
      anti.instanceId === selfId &&
      stud.x === cell.x &&
      stud.z === cell.z &&
      stud.y === cell.y - 1 &&
      anti.x === cell.x &&
      anti.z === cell.z &&
      anti.y === cell.y
    );
  });
}

function reachesBase(
  state: RoomState,
  connections: Connection[],
  selfId: string,
  chair: Chair,
): boolean {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const c of state.connections) add(c.a.instanceId, c.b.instanceId);
  for (const c of connections) add(c.a.instanceId, c.b.instanceId);

  const chairOf = (id: string): Chair | null => {
    if (id === selfId) return chair;
    return state.instances.find((p) => p.id === id)?.cadeira ?? null;
  };

  const target = baseId(chair);
  const seen = new Set<string>();
  const queue = [selfId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (chairOf(id) !== chair) continue;
    if (id === target) return true;
    for (const next of adj.get(id) ?? []) queue.push(next);
  }
  return false;
}

/**
 * Decide se uma pose é legal. Não altera o estado.
 * Ordem: grade, colisão, pares compatíveis, cadeira, apoio, caminho até a base.
 */
export function evaluatePlacement(
  state: RoomState,
  chair: Chair,
  instance: PieceInstance,
  pose: Pose,
): PlacementResult {
  if (!gradeOk(pose)) return { ok: false, motivo: "FORA_DA_GRADE" };
  const def = CATALOG[instance.defId];
  if (!def || def.fixa) return { ok: false, motivo: "BASE_FIXA" };

  const worldCells = def.cells.map((cell) => ({
    kind: cell.kind,
    ...worldVec(cell, pose),
  }));
  const selfSockets = def.sockets.map((socket) => projectSocket(instance.id, chair, socket, pose));
  const occ = occupancy(state, instance.id);
  const others = placedSockets(state, instance.id);
  const matings: Mating[] = [];
  const seen = new Set<string>();
  const tunnelHosts = new Set<string>();

  const push = (m: Mating) => {
    const key = matingKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    matings.push(m);
  };

  for (const cell of worldCells) {
    const host = occ.get(cellKey(cell));
    if (!host) continue;
    const axleMate = (): Mating | null => {
      for (const s of selfSockets) {
        if (s.x !== cell.x || s.y !== cell.y || s.z !== cell.z) continue;
        for (const o of others) {
          if (o.instanceId !== host.instanceId) continue;
          if (o.x !== cell.x || o.y !== cell.y || o.z !== cell.z) continue;
          if (pairMates(s, o)) return { a: s, b: o };
        }
      }
      return null;
    };
    if (cell.kind === "solido" && host.kind === "tunel") {
      const mate = axleMate();
      if (!mate) return { ok: false, motivo: "COLISAO" };
      push(mate);
      tunnelHosts.add(cellKey(cell));
      continue;
    }
    if (cell.kind === "tunel" && host.kind === "solido") {
      const mate = axleMate();
      if (!mate) return { ok: false, motivo: "COLISAO" };
      push(mate);
      continue;
    }
    return { ok: false, motivo: "COLISAO" };
  }

  for (const s of selfSockets) {
    for (const o of others) {
      if (pairMates(s, o)) push({ a: s, b: o });
    }
  }

  if (matings.some((m) => m.b.cadeira !== chair || m.a.cadeira !== chair)) {
    return { ok: false, motivo: "CONSTRUCAO_ALHEIA" };
  }

  for (const cell of worldCells) {
    if (cell.kind !== "solido") continue;
    if (tunnelHosts.has(cellKey(cell))) continue;
    const below = occ.get(cellKey({ x: cell.x, y: cell.y - 1, z: cell.z }));
    if (!below) continue;
    if (
      !verticalBrickContact(matings, cell, below.instanceId, instance.id) &&
      !axleHubAdjacent(matings, cell, below.instanceId, instance.id)
    ) {
      return { ok: false, motivo: "ENCAIXE_INVALIDO" };
    }
  }

  const connections = matings.map(toConnection);
  if (!reachesBase(state, connections, instance.id, chair)) {
    return { ok: false, motivo: "FLUTUANDO" };
  }
  return { ok: true, connections };
}
