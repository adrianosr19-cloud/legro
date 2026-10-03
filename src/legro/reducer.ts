import { CATALOG } from "./catalog.ts";
import type {
  ApplyResult,
  Chair,
  GameEvent,
  IntentEnvelope,
  PieceInstance,
  RejectReason,
  RoomState,
} from "./types.ts";
import { evaluatePlacement } from "./validate.ts";

function isChair(value: number): value is Chair {
  return value === 0 || value === 1 || value === 2;
}

function cloneState(state: RoomState): RoomState {
  return {
    revision: state.revision + 1,
    instances: state.instances.map((piece) => ({
      ...piece,
      pose: piece.pose ? { ...piece.pose } : null,
    })),
    connections: state.connections.map((c) => ({
      a: { ...c.a },
      b: { ...c.b },
    })),
    log: state.log.slice(),
  };
}

function findPiece(state: RoomState, id: string): PieceInstance | undefined {
  return state.instances.find((piece) => piece.id === id);
}

function replace(state: RoomState, piece: PieceInstance): void {
  const index = state.instances.findIndex((item) => item.id === piece.id);
  if (index >= 0) state.instances[index] = piece;
}

function refuse(
  state: RoomState,
  chair: Chair,
  instanceId: string,
  motivo: RejectReason,
): ApplyResult {
  const next = cloneState(state);
  const event: GameEvent = {
    revision: next.revision,
    cadeira: chair,
    tipo: "recusou",
    instanceId,
    motivo,
  };
  next.log = [...next.log, event];
  return { ok: false, motivo, state: next };
}

function handError(piece: PieceInstance, chair: Chair): RejectReason | null {
  const def = CATALOG[piece.defId];
  if (!def || def.fixa || piece.holder === "fixa") return "BASE_FIXA";
  if (piece.holder === chair) return null;
  if (piece.holder === "mesa") return "NAO_ESTA_NA_MAO";
  return "PECA_JA_PEGUE";
}

export function applyIntent(state: RoomState, envelope: IntentEnvelope): ApplyResult {
  if (envelope.baseRevision !== state.revision) {
    return { ok: false, motivo: "REVISAO_ANTIGA", state };
  }
  const { intent } = envelope;
  if (!isChair(intent.chair)) {
    return { ok: false, motivo: "FORA_DA_GRADE", state };
  }

  const piece = findPiece(state, intent.instanceId);
  if (!piece) return refuse(state, intent.chair, intent.instanceId, "PECA_DESCONHECIDA");
  const def = CATALOG[piece.defId];

  if (intent.type === "pegar") {
    if (!def || def.fixa || piece.holder === "fixa") {
      return refuse(state, intent.chair, piece.id, "BASE_FIXA");
    }
    if (piece.pose) return refuse(state, intent.chair, piece.id, "JA_COLOCADA");
    if (piece.holder !== "mesa") return refuse(state, intent.chair, piece.id, "PECA_JA_PEGUE");
    const next = cloneState(state);
    replace(next, { ...piece, holder: intent.chair });
    next.log = [
      ...next.log,
      { revision: next.revision, cadeira: intent.chair, tipo: "pegou", instanceId: piece.id },
    ];
    return { ok: true, state: next };
  }

  if (intent.type === "devolver") {
    if (!def || def.fixa || piece.holder === "fixa") {
      return refuse(state, intent.chair, piece.id, "BASE_FIXA");
    }
    if (piece.pose) return refuse(state, intent.chair, piece.id, "JA_COLOCADA");
    if (piece.holder === "mesa") return refuse(state, intent.chair, piece.id, "NAO_ESTA_NA_MESA");
    if (piece.holder !== intent.chair)
      return refuse(state, intent.chair, piece.id, "PECA_JA_PEGUE");
    const next = cloneState(state);
    replace(next, { ...piece, holder: "mesa", cadeira: null });
    next.log = [
      ...next.log,
      { revision: next.revision, cadeira: intent.chair, tipo: "devolveu", instanceId: piece.id },
    ];
    return { ok: true, state: next };
  }

  if (intent.type === "encaixar") {
    if (!def || def.fixa || piece.holder === "fixa") {
      return refuse(state, intent.chair, piece.id, "BASE_FIXA");
    }
    if (piece.pose) return refuse(state, intent.chair, piece.id, "JA_COLOCADA");
    const held = handError(piece, intent.chair);
    if (held) return refuse(state, intent.chair, piece.id, held);
    const verdict = evaluatePlacement(state, intent.chair, piece, intent.pose);
    if (!verdict.ok) return refuse(state, intent.chair, piece.id, verdict.motivo);
    const next = cloneState(state);
    replace(next, {
      ...piece,
      holder: intent.chair,
      pose: { ...intent.pose },
      cadeira: intent.chair,
    });
    next.connections = [...next.connections, ...verdict.connections];
    next.log = [
      ...next.log,
      {
        revision: next.revision,
        cadeira: intent.chair,
        tipo: "encaixou",
        instanceId: piece.id,
        pose: { ...intent.pose },
        encaixes: verdict.connections.length,
      },
    ];
    return { ok: true, state: next };
  }

  if (!def || def.fixa || piece.holder === "fixa") {
    return refuse(state, intent.chair, piece.id, "BASE_FIXA");
  }
  if (!piece.pose || piece.cadeira === null) {
    return refuse(state, intent.chair, piece.id, "NAO_ESTA_COLOCADA");
  }
  if (piece.cadeira !== intent.chair) {
    return refuse(state, intent.chair, piece.id, "CONSTRUCAO_ALHEIA");
  }

  const removed = new Set<string>([piece.id]);
  const remaining = state.connections.filter(
    (c) => c.a.instanceId !== piece.id && c.b.instanceId !== piece.id,
  );
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const c of remaining) link(c.a.instanceId, c.b.instanceId);

  const anchored = new Set<string>();
  const queue = [`base-${intent.chair}`];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (anchored.has(id)) continue;
    anchored.add(id);
    for (const nextId of adj.get(id) ?? []) queue.push(nextId);
  }

  for (const other of state.instances) {
    if (other.cadeira !== intent.chair || !other.pose || other.id === piece.id) continue;
    if (!anchored.has(other.id)) removed.add(other.id);
  }

  const next = cloneState(state);
  const released = [...removed].filter((id) => id !== piece.id).sort();
  for (const id of removed) {
    const current = findPiece(next, id)!;
    replace(next, { ...current, holder: intent.chair, pose: null, cadeira: null });
  }
  next.connections = remaining.filter(
    (c) => !removed.has(c.a.instanceId) && !removed.has(c.b.instanceId),
  );
  const events: GameEvent[] = [
    {
      revision: next.revision,
      cadeira: intent.chair,
      tipo: "desmontou",
      instanceId: piece.id,
      causa: "pedido",
    },
    ...released.map((id): GameEvent => ({
      revision: next.revision,
      cadeira: intent.chair,
      tipo: "desmontou",
      instanceId: id,
      causa: "cascata",
    })),
  ];
  next.log = [...next.log, ...events];
  return { ok: true, state: next };
}

/** Aplica intenções em série. A segunda, se nasceu da revisão antiga, não grava. */
export function applySerialized(
  state: RoomState,
  envelopes: IntentEnvelope[],
): { state: RoomState; results: ApplyResult[] } {
  const results: ApplyResult[] = [];
  let current = state;
  for (const envelope of envelopes) {
    const result = applyIntent(current, envelope);
    results.push(result);
    current = result.state;
  }
  return { state: current, results };
}
