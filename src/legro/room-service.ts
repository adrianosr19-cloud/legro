import { randomBytes } from "node:crypto";
import { createInitialState } from "./initial-state.ts";
import {
  answerPiece,
  askPiece,
  returnPiece,
  settleAfterLaw,
  type LoanFact,
  type LoanReason,
  type LoanRecord,
} from "./loan.ts";
import { applyIntent } from "./reducer.ts";
import { buildReport, closePendingForExhibition, type MatchReport } from "./report.ts";
import { RoomCodeTaken, type RoomRepo } from "./room-repo.ts";
import type { Chair, Intent, Pose, RejectReason, RoomState } from "./types.ts";

/** Trinta minutos. O relógio é o da sala, não o do navegador. */
export const MATCH_MS = 30 * 60 * 1000;

export type Phase = "espera" | "construindo" | "exposicao";

export type RoomReason =
  | "SALA_DESCONHECIDA"
  | "CADEIRA_OCUPADA"
  | "CADEIRA_INVALIDA"
  | "CADEIRA_FORA"
  | "PEDIDO_DESCONHECIDO"
  | "PEDIDO_PENDENTE"
  | "NAO_E_ANFITRIAO"
  | "FORA_DE_FASE"
  | "JA_COMECOU"
  | "SALA_CHEIA"
  | "REVISAO_ANTIGA"
  | LoanReason;

export type Seat = { chair: Chair; token: string | null };

export type JoinRequest = {
  id: string;
  secret: string;
  chair: Chair;
  status: "pendente" | "aceito" | "recusado";
  seatToken: string | null;
};

/** Documento da sala. Segredos ficam aqui e não saem na vista pública. */
export type RoomDoc = {
  code: string;
  roomRevision: number;
  phase: Phase;
  startedAt: number | null;
  durationMs: number;
  hostSecret: string;
  hostChair: Chair;
  seats: Seat[];
  requests: JoinRequest[];
  /** Fatos de posse. Não são a lei do encaixe. */
  loans: LoanRecord[];
  history: LoanFact[];
  /** Instante em que a sala entrou em exposição. Null enquanto constrói. */
  closedAt: number | null;
  /** Retrato factual. Null até o encerramento. Não contém nota. */
  report: MatchReport | null;
  law: RoomState;
};

export type PublicRoom = {
  code: string;
  roomRevision: number;
  phase: Phase;
  startedAt: number | null;
  durationMs: number;
  serverNow: number;
  seats: { chair: Chair; occupied: boolean; pending: boolean }[];
  law: RoomState;
  you: { chair: Chair; host: boolean } | null;
  requests: { id: string; chair: Chair }[] | null;
  loans: LoanRecord[];
  history: LoanFact[];
  closedAt: number | null;
  report: MatchReport | null;
};

export type ClientIntent =
  | { type: "pegar"; instanceId: string }
  | { type: "devolver"; instanceId: string }
  | { type: "desmontar"; instanceId: string }
  | { type: "encaixar"; instanceId: string; pose: Pose };

export type RoomEnvelope = {
  ok: boolean;
  motivo: RoomReason | RejectReason | null;
  room: PublicRoom | null;
  seatToken: string | null;
  hostSecret: string | null;
  requestId: string | null;
  requestSecret: string | null;
  status: "pendente" | "aceito" | "recusado" | null;
};

const CHAIRS: readonly Chair[] = [0, 1, 2];
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function isChair(value: number): value is Chair {
  return value === 0 || value === 1 || value === 2;
}

/** Salas gravadas antes do empréstimo não têm essas listas. O fato nasce vazio, não inventado. */
function hydrate(doc: RoomDoc): RoomDoc {
  if (!Array.isArray(doc.loans)) doc.loans = [];
  if (!Array.isArray(doc.history)) doc.history = [];
  if (doc.closedAt === undefined) doc.closedAt = null;
  if (doc.report === undefined) doc.report = null;
  return doc;
}

/** A fase nasce de começou_em. O valor gravado que discorde do relógio é corrigido. */
export function projectPhase(doc: RoomDoc, now: number): Phase {
  if (doc.startedAt == null) return "espera";
  if (now >= doc.startedAt + doc.durationMs) return "exposicao";
  return "construindo";
}

function openForBuilding(doc: RoomDoc, at: number): boolean {
  return projectPhase(doc, at) === "construindo";
}

function withClock(doc: RoomDoc, now: number): { doc: RoomDoc; changed: boolean } {
  const phase = projectPhase(doc, now);
  if (phase === doc.phase) return { doc, changed: false };
  const next = structuredClone(doc);
  next.roomRevision += 1;
  if (phase !== "exposicao") {
    next.phase = phase;
    return { doc: next, changed: true };
  }
  next.phase = "exposicao";
  if (doc.report) return { doc: next, changed: true };
  const closed = closePendingForExhibition(doc.loans, doc.history, now, next.roomRevision, doc.law.revision);
  next.loans = closed.loans;
  next.history = closed.history;
  next.closedAt = now;
  next.report = buildReport({
    law: next.law,
    history: next.history,
    roomRevision: next.roomRevision,
    startedAt: next.startedAt ?? now,
    closedAt: now,
    durationMs: next.durationMs,
    closedLoanIds: closed.closedIds,
  });
  return { doc: next, changed: true };
}

function defaultRng(): string {
  return randomBytes(16).toString("hex");
}

function codeFrom(rng: () => string): string {
  const hex = rng();
  let code = "";
  for (let i = 0; i < 8; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    code += ALPHABET[(Number.isFinite(byte) ? byte : 0) % ALPHABET.length];
  }
  return code;
}

function secretOk(stored: string, given: string): boolean {
  if (stored.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function findSeat(doc: RoomDoc, token: string): Seat | undefined {
  return doc.seats.find((seat) => seat.token !== null && secretOk(seat.token, token));
}

function hostToken(doc: RoomDoc): string | null {
  return doc.seats.find((seat) => seat.chair === doc.hostChair)?.token ?? null;
}

function blank(): RoomEnvelope {
  return {
    ok: false,
    motivo: null,
    room: null,
    seatToken: null,
    hostSecret: null,
    requestId: null,
    requestSecret: null,
    status: null,
  };
}

function pack(
  partial: Partial<RoomEnvelope> & { ok: boolean; room: PublicRoom | null },
): RoomEnvelope {
  return { ...blank(), ...partial };
}

function present(
  doc: RoomDoc,
  now: number,
  seatToken: string | null,
  hostSecret: string | null,
): PublicRoom {
  const seat = seatToken ? findSeat(doc, seatToken) : undefined;
  const host = !!hostSecret && secretOk(doc.hostSecret, hostSecret);
  return {
    code: doc.code,
    roomRevision: doc.roomRevision,
    phase: doc.phase,
    startedAt: doc.startedAt,
    durationMs: doc.durationMs,
    serverNow: now,
    seats: doc.seats.map((item) => ({
      chair: item.chair,
      occupied: item.token !== null,
      pending: doc.requests.some((req) => req.chair === item.chair && req.status === "pendente"),
    })),
    law: doc.law,
    you: seat ? { chair: seat.chair, host } : null,
    requests: host
      ? doc.requests
          .filter((req) => req.status === "pendente")
          .map((req) => ({ id: req.id, chair: req.chair }))
      : null,
    loans: doc.loans ?? [],
    history: doc.history ?? [],
    closedAt: doc.closedAt ?? null,
    report: doc.report ?? null,
  };
}

function toIntent(client: ClientIntent, chair: Chair): Intent {
  switch (client.type) {
    case "pegar":
      return { type: "pegar", chair, instanceId: client.instanceId };
    case "devolver":
      return { type: "devolver", chair, instanceId: client.instanceId };
    case "desmontar":
      return { type: "desmontar", chair, instanceId: client.instanceId };
    case "encaixar":
      return { type: "encaixar", chair, instanceId: client.instanceId, pose: client.pose };
  }
}

/**
 * A sala só muda por comando sobre o documento.
 * Um navegador não envia o estado inteiro, e o relógio dele não encerra a rodada.
 */
export function createRoomService(repo: RoomRepo, now: () => number, rng: () => string = defaultRng) {
  async function loadClock(code: string): Promise<{ revision: number; doc: RoomDoc } | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await repo.read(code);
      if (!row) return null;
      hydrate(row.doc);
      const clock = withClock(row.doc, now());
      if (!clock.changed) return row;
      const wrote = await repo.compareAndSwap(code, row.revision, clock.doc);
      if (wrote) return { revision: clock.doc.roomRevision, doc: clock.doc };
    }
    const last = await repo.read(code);
    if (last) hydrate(last.doc);
    return last;
  }

  async function create(chair: number): Promise<RoomEnvelope> {
    if (!isChair(chair)) return pack({ ok: false, motivo: "CADEIRA_FORA", room: null });
    for (let attempt = 0; attempt < 5; attempt++) {
      const seatToken = rng();
      const hostSecret = rng();
      const doc: RoomDoc = {
        code: codeFrom(rng),
        roomRevision: 0,
        phase: "espera",
        startedAt: null,
        durationMs: MATCH_MS,
        hostSecret,
        hostChair: chair,
        seats: CHAIRS.map((item) => ({ chair: item, token: item === chair ? seatToken : null })),
        requests: [],
        loans: [],
        history: [],
        closedAt: null,
        report: null,
        law: createInitialState(),
      };
      try {
        await repo.insert(doc);
      } catch (err) {
        if (err instanceof RoomCodeTaken) continue;
        throw err;
      }
      return pack({
        ok: true,
        room: present(doc, now(), seatToken, hostSecret),
        seatToken,
        hostSecret,
      });
    }
    return pack({ ok: false, motivo: "SALA_CHEIA", room: null });
  }

  async function requestJoin(code: string, chair: number): Promise<RoomEnvelope> {
    if (!isChair(chair)) return pack({ ok: false, motivo: "CADEIRA_FORA", room: null });
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    if (projectPhase(row.doc, now()) === "exposicao") {
      return pack({ ok: false, motivo: "FORA_DE_FASE", room: present(row.doc, now(), null, null) });
    }
    if (row.doc.seats[chair]?.token) {
      return pack({ ok: false, motivo: "CADEIRA_OCUPADA", room: present(row.doc, now(), null, null) });
    }
    if (row.doc.requests.some((req) => req.chair === chair && req.status === "pendente")) {
      return pack({ ok: false, motivo: "PEDIDO_PENDENTE", room: present(row.doc, now(), null, null) });
    }
    if (row.doc.requests.filter((req) => req.status === "pendente").length >= 3) {
      return pack({ ok: false, motivo: "SALA_CHEIA", room: present(row.doc, now(), null, null) });
    }
    const next = structuredClone(row.doc);
    const requestId = rng();
    const requestSecret = rng();
    next.requests.push({
      id: requestId,
      secret: requestSecret,
      chair,
      status: "pendente",
      seatToken: null,
    });
    next.roomRevision += 1;
    const wrote = await repo.compareAndSwap(code, row.revision, next);
    if (!wrote) return requestJoin(code, chair);
    return pack({
      ok: true,
      room: present(next, now(), null, null),
      requestId,
      requestSecret,
      status: "pendente",
    });
  }

  async function pollJoin(code: string, requestId: string, requestSecret: string): Promise<RoomEnvelope> {
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    const req = row.doc.requests.find((item) => item.id === requestId && secretOk(item.secret, requestSecret));
    if (!req) return pack({ ok: false, motivo: "PEDIDO_DESCONHECIDO", room: null });
    return pack({
      ok: true,
      status: req.status,
      seatToken: req.status === "aceito" ? req.seatToken : null,
      room: present(row.doc, now(), req.seatToken, null),
    });
  }

  async function read(code: string, seatToken: string | null, hostSecret: string | null): Promise<RoomEnvelope> {
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    const token = seatToken && findSeat(row.doc, seatToken) ? seatToken : null;
    return pack({ ok: true, room: present(row.doc, now(), token, hostSecret) });
  }

  async function answer(code: string, hostSecret: string, requestId: string, accept: boolean): Promise<RoomEnvelope> {
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    if (!secretOk(row.doc.hostSecret, hostSecret)) {
      return pack({ ok: false, motivo: "NAO_E_ANFITRIAO", room: present(row.doc, now(), null, null) });
    }
    const req = row.doc.requests.find((item) => item.id === requestId && item.status === "pendente");
    if (!req) {
      return pack({
        ok: false,
        motivo: "PEDIDO_DESCONHECIDO",
        room: present(row.doc, now(), hostToken(row.doc), hostSecret),
      });
    }
    const next = structuredClone(row.doc);
    const target = next.requests.find((item) => item.id === requestId)!;
    if (!accept) {
      target.status = "recusado";
    } else if (next.seats[target.chair]?.token) {
      target.status = "recusado";
      next.roomRevision += 1;
      const wrote = await repo.compareAndSwap(code, row.revision, next);
      if (!wrote) return answer(code, hostSecret, requestId, accept);
      return pack({
        ok: false,
        motivo: "CADEIRA_OCUPADA",
        room: present(next, now(), hostToken(next), hostSecret),
      });
    } else {
      const seatToken = rng();
      target.status = "aceito";
      target.seatToken = seatToken;
      next.seats[target.chair] = { chair: target.chair, token: seatToken };
    }
    next.roomRevision += 1;
    const wrote = await repo.compareAndSwap(code, row.revision, next);
    if (!wrote) return answer(code, hostSecret, requestId, accept);
    return pack({
      ok: true,
      room: present(next, now(), hostToken(next), hostSecret),
      status: target.status,
    });
  }

  async function start(code: string, hostSecret: string): Promise<RoomEnvelope> {
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    if (!secretOk(row.doc.hostSecret, hostSecret)) {
      return pack({ ok: false, motivo: "NAO_E_ANFITRIAO", room: present(row.doc, now(), null, null) });
    }
    if (row.doc.startedAt != null) {
      return pack({ ok: false, motivo: "JA_COMECOU", room: present(row.doc, now(), hostToken(row.doc), hostSecret) });
    }
    const next = structuredClone(row.doc);
    next.startedAt = now();
    next.phase = projectPhase(next, now());
    next.roomRevision += 1;
    const wrote = await repo.compareAndSwap(code, row.revision, next);
    if (!wrote) return start(code, hostSecret);
    return pack({ ok: true, room: present(next, now(), hostToken(next), hostSecret) });
  }

  async function intent(
    code: string,
    seatToken: string,
    envelope: { baseRevision: number; intent: ClientIntent },
  ): Promise<RoomEnvelope> {
    const row = await loadClock(code);
    if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
    const seat = findSeat(row.doc, seatToken);
    const asHost = seat && seat.chair === row.doc.hostChair ? row.doc.hostSecret : null;
    if (!openForBuilding(row.doc, now())) {
      return pack({
        ok: false,
        motivo: "FORA_DE_FASE",
        room: present(row.doc, now(), seat ? seatToken : null, asHost),
      });
    }
    if (!seat) {
      return pack({ ok: false, motivo: "CADEIRA_INVALIDA", room: present(row.doc, now(), null, null) });
    }
    const lawResult = applyIntent(row.doc.law, {
      baseRevision: envelope.baseRevision,
      intent: toIntent(envelope.intent, seat.chair),
    });
    if (!lawResult.ok && lawResult.motivo === "REVISAO_ANTIGA") {
      return pack({
        ok: false,
        motivo: "REVISAO_ANTIGA",
        room: present(row.doc, now(), seatToken, asHost),
      });
    }
    const next = structuredClone(row.doc);
    next.law = lawResult.state;
    if (lawResult.ok) {
      const settled = settleAfterLaw(
        lawResult.state,
        row.doc.loans,
        row.doc.history,
        now(),
        row.doc.roomRevision + 1,
      );
      next.loans = settled.loans;
      next.history = settled.history;
    }
    next.roomRevision += 1;
    const wrote = await repo.compareAndSwap(code, row.revision, next);
    if (!wrote) {
      const fresh = await repo.read(code);
      if (fresh) hydrate(fresh.doc);
      const doc = fresh?.doc ?? row.doc;
      const phase = projectPhase(doc, now());
      const freshHost = seat.chair === doc.hostChair ? doc.hostSecret : null;
      return pack({
        ok: false,
        motivo: phase !== "construindo" ? "FORA_DE_FASE" : "REVISAO_ANTIGA",
        room: present(doc, now(), seatToken, freshHost),
      });
    }
    return pack({
      ok: lawResult.ok,
      motivo: lawResult.ok ? null : lawResult.motivo,
      room: present(next, now(), seatToken, asHost),
    });
  }

  /**
   * Voltar à sala. O terceiro argumento existe para o teste provar que é ignorado:
   * a tela antiga não é escrita por cima do documento.
   */
  async function reconnect(code: string, seatToken: string, _clientSnapshot?: unknown): Promise<RoomEnvelope> {
    void _clientSnapshot;
    return read(code, seatToken, null);
  }

  /**
   * Pedido, resposta e devolução. Se duas telas gravam ao mesmo tempo,
   * a segunda relê o documento e aplica a regra de novo — não cria outra peça.
   */
  async function commitLoan(
    code: string,
    seatToken: string,
    run: (doc: RoomDoc, chair: Chair) => { ok: boolean; motivo: LoanReason | null; write: boolean; law: RoomState; loans: LoanRecord[]; history: LoanFact[] },
  ): Promise<RoomEnvelope> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await loadClock(code);
      if (!row) return pack({ ok: false, motivo: "SALA_DESCONHECIDA", room: null });
      const seat = findSeat(row.doc, seatToken);
      const asHost = seat && seat.chair === row.doc.hostChair ? row.doc.hostSecret : null;
      if (!openForBuilding(row.doc, now())) {
        return pack({
          ok: false,
          motivo: "FORA_DE_FASE",
          room: present(row.doc, now(), seat ? seatToken : null, asHost),
        });
      }
      if (!seat) {
        return pack({ ok: false, motivo: "CADEIRA_INVALIDA", room: present(row.doc, now(), null, null) });
      }
      const mutation = run(row.doc, seat.chair);
      if (!mutation.write) {
        return pack({
          ok: false,
          motivo: mutation.motivo,
          room: present(row.doc, now(), seatToken, asHost),
        });
      }
      const next = structuredClone(row.doc);
      next.law = mutation.law;
      next.loans = mutation.loans;
      next.history = mutation.history;
      next.roomRevision += 1;
      const wrote = await repo.compareAndSwap(code, row.revision, next);
      if (!wrote) continue;
      return pack({
        ok: mutation.ok,
        motivo: mutation.motivo,
        room: present(next, now(), seatToken, asHost),
      });
    }
    const fresh = await repo.read(code);
    if (fresh) hydrate(fresh.doc);
    return pack({
      ok: false,
      motivo: "REVISAO_ANTIGA",
      room: fresh ? present(fresh.doc, now(), seatToken, null) : null,
    });
  }

  async function requestLoan(
    code: string,
    seatToken: string,
    pieceId: string,
    expectedHolder: number,
  ): Promise<RoomEnvelope> {
    if (!isChair(expectedHolder)) return pack({ ok: false, motivo: "CADEIRA_FORA", room: null });
    const holder = expectedHolder;
    return commitLoan(code, seatToken, (doc, chair) =>
      askPiece(
        doc.law,
        doc.loans,
        doc.history,
        chair,
        pieceId,
        holder,
        now(),
        doc.roomRevision + 1,
        rng(),
      ),
    );
  }

  async function answerLoan(
    code: string,
    seatToken: string,
    loanId: string,
    accept: boolean,
  ): Promise<RoomEnvelope> {
    return commitLoan(code, seatToken, (doc, chair) =>
      answerPiece(doc.law, doc.loans, doc.history, chair, loanId, accept, now(), doc.roomRevision + 1),
    );
  }

  async function returnLoan(code: string, seatToken: string, pieceId: string): Promise<RoomEnvelope> {
    return commitLoan(code, seatToken, (doc, chair) =>
      returnPiece(doc.law, doc.loans, doc.history, chair, pieceId, now(), doc.roomRevision + 1),
    );
  }

  return {
    create,
    requestJoin,
    pollJoin,
    read,
    answer,
    start,
    intent,
    reconnect,
    requestLoan,
    answerLoan,
    returnLoan,
  };
}

export type RoomService = ReturnType<typeof createRoomService>;
