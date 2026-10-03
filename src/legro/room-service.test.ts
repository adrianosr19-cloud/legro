import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createSqlRoomRepo, type Queryable, type RoomRepo } from "./room-repo.ts";
import {
  createRoomService,
  MATCH_MS,
  type ClientIntent,
  type PublicRoom,
  type RoomEnvelope,
  type RoomService,
} from "./room-service.ts";
import type { RoomState } from "./types.ts";

let repo: RoomRepo;
let pg: PGlite;

function adapt(db: PGlite): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await db.query<T>(text, params);
      return result.rows;
    },
  };
}

function must(result: RoomEnvelope): PublicRoom {
  if (!result.ok || !result.room) throw new Error(result.motivo ?? "sem sala");
  return result.room;
}

function shown(result: RoomEnvelope): PublicRoom {
  if (!result.room) throw new Error(result.motivo ?? "sem sala");
  return result.room;
}

function piece(law: RoomState, id: string) {
  const found = law.instances.find((item) => item.id === id);
  if (!found) throw new Error(`peça ${id} sumiu`);
  return found;
}

function idNaMesa(law: RoomState, defId: string) {
  const found = law.instances.find((item) => item.defId === defId && item.holder === "mesa" && item.pose === null);
  if (!found) throw new Error(`sem ${defId} na mesa`);
  return found.id;
}

before(async () => {
  pg = new PGlite();
  await pg.waitReady;
  const sql = readFileSync(new URL("../../migrations/0002_legro_rooms.sql", import.meta.url), "utf8");
  await pg.exec(sql);
  repo = createSqlRoomRepo(adapt(pg));
});

describe("documento da sala", { concurrency: false }, () => {
  it("três cadeiras: pedido, aceite, recusa e cadeira ocupada", async () => {
    const svc = createRoomService(repo, () => 1_000);
    const created = await svc.create(0);
    const room = must(created);
    assert.equal(room.you?.host, true);
    assert.equal(room.you?.chair, 0);
    assert.equal(room.seats.filter((seat) => seat.occupied).length, 1);
    assert.equal(JSON.stringify(room).includes(created.hostSecret ?? "???"), false);
    assert.equal(JSON.stringify(room).includes(created.seatToken ?? "???"), false);

    const occupied = await svc.requestJoin(room.code, 0);
    assert.equal(occupied.ok, false);
    assert.equal(occupied.motivo, "CADEIRA_OCUPADA");

    const ask = await svc.requestJoin(room.code, 1);
    assert.equal(ask.ok, true);
    assert.ok(ask.requestId && ask.requestSecret);
    const hostView = must(await svc.read(room.code, created.seatToken, created.hostSecret));
    assert.equal(hostView.requests?.length, 1);
    assert.equal(JSON.stringify(hostView).includes(ask.requestSecret ?? "???"), false);

    const stranger = await svc.answer(room.code, "nao-sou-o-anfitriao-xx", ask.requestId!, true);
    assert.equal(stranger.motivo, "NAO_E_ANFITRIAO");

    const refused = await svc.answer(room.code, created.hostSecret!, ask.requestId!, false);
    assert.equal(refused.ok, true);
    assert.equal(must(refused).seats[1]?.occupied, false);
    const poll = await svc.pollJoin(room.code, ask.requestId!, ask.requestSecret!);
    assert.equal(poll.status, "recusado");
    assert.equal(poll.seatToken, null);

    const again = await svc.requestJoin(room.code, 1);
    await svc.answer(room.code, created.hostSecret!, again.requestId!, true);
    const seated = await svc.pollJoin(room.code, again.requestId!, again.requestSecret!);
    assert.equal(seated.status, "aceito");
    assert.ok(seated.seatToken);
    const guest = must(await svc.read(room.code, seated.seatToken, null));
    assert.equal(guest.you?.chair, 1);
    assert.equal(guest.you?.host, false);
    assert.equal(guest.requests, null);

    const third = await svc.requestJoin(room.code, 2);
    await svc.answer(room.code, created.hostSecret!, third.requestId!, true);
    const full = must(await svc.read(room.code, created.seatToken, created.hostSecret));
    assert.equal(full.seats.every((seat) => seat.occupied), true);
  });

  it("A pega a roda, B deixa de vê-la, A monta, B vê, A desmonta", async () => {
    const svc = createRoomService(repo, () => 10_000);
    const { code, hostSecret, tokenA, tokenB, tokenC } = await trio(svc);
    const start = must(await svc.read(code, tokenB, null));
    const wheelId = idNaMesa(start.law, "roda_grande");
    const holeId = idNaMesa(start.law, "bloco_furo_eixo_2x2");
    const axleId = idNaMesa(start.law, "eixo_4");

    const picked = await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: wheelId });
    const seenByB = must(await svc.read(code, tokenB, null));
    assert.equal(piece(seenByB.law, wheelId).holder, 0);
    assert.equal(piece(seenByB.law, wheelId).pose, null);
    assert.equal(seenByB.roomRevision, picked.roomRevision);
    assert.equal(
      seenByB.law.instances.some((item) => item.id === wheelId && item.holder === "mesa"),
      false,
    );

    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: holeId });
    await act(svc, code, tokenA, hostSecret, {
      type: "encaixar",
      instanceId: holeId,
      pose: { x: 6, y: 1, z: 0, yaw: 0 },
    });
    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: axleId });
    await act(svc, code, tokenA, hostSecret, {
      type: "encaixar",
      instanceId: axleId,
      pose: { x: 6, y: 2, z: 0, yaw: 0 },
    });
    const placed = await act(svc, code, tokenA, hostSecret, {
      type: "encaixar",
      instanceId: wheelId,
      pose: { x: 9, y: 2, z: 0, yaw: 0 },
    });
    const built = must(await svc.read(code, tokenB, null));
    assert.deepEqual(piece(built.law, wheelId).pose, { x: 9, y: 2, z: 0, yaw: 0 });
    assert.equal(piece(built.law, wheelId).cadeira, 0);
    assert.equal(built.law.revision, placed.law.revision);

    const down = await act(svc, code, tokenA, hostSecret, { type: "desmontar", instanceId: wheelId });
    const afterB = must(await svc.read(code, tokenB, null));
    const afterC = must(await svc.read(code, tokenC, null));
    assert.equal(piece(afterB.law, wheelId).holder, 0);
    assert.equal(piece(afterB.law, wheelId).pose, null);
    assert.equal(afterB.law.revision, afterC.law.revision);
    assert.equal(afterC.roomRevision, down.roomRevision);
    assert.equal(
      afterB.law.instances.some((item) => item.id === wheelId && item.holder === "mesa"),
      false,
    );

    const back = await act(svc, code, tokenA, hostSecret, { type: "devolver", instanceId: wheelId });
    const free = must(await svc.read(code, tokenB, null));
    assert.equal(piece(free.law, wheelId).holder, "mesa");
    assert.equal(free.roomRevision, back.roomRevision);
  });

  it("duas telas na mesma revisão: só uma intenção entra", async () => {
    const svc = createRoomService(repo, () => 20_000);
    const { code, tokenA, tokenB } = await trio(svc);
    const seen = must(await svc.read(code, tokenA, null));
    const wheelId = idNaMesa(seen.law, "roda_pequena");
    const rev = seen.law.revision;
    const [a, b] = await Promise.all([
      svc.intent(code, tokenA, { baseRevision: rev, intent: { type: "pegar", instanceId: wheelId } }),
      svc.intent(code, tokenB, { baseRevision: rev, intent: { type: "pegar", instanceId: wheelId } }),
    ]);
    const wins = [a, b].filter((result) => result.ok);
    const loss = [a, b].find((result) => !result.ok);
    assert.equal(wins.length, 1);
    assert.ok(loss);
    assert.equal(loss.motivo, "REVISAO_ANTIGA");
    assert.equal(a.room?.law.revision, b.room?.law.revision);
    const holder = piece(loss.room!.law, wheelId).holder;
    assert.equal(holder === 0 || holder === 1, true);
    assert.equal(piece(a.room!.law, wheelId).holder, holder);

    const loser = a.ok ? tokenB : tokenA;
    const retry = await svc.intent(code, loser, {
      baseRevision: loss.room!.law.revision,
      intent: { type: "pegar", instanceId: wheelId },
    });
    assert.equal(retry.ok, false);
    assert.equal(retry.motivo, "PECA_JA_PEGUE");

    const fresh = must(await svc.read(code, tokenA, null));
    const bricks = fresh.law.instances.filter((item) => item.defId === "bloco_1x1" && item.holder === "mesa");
    assert.ok(bricks[0] && bricks[1]);
    const base = fresh.law.revision;
    const [left, right] = await Promise.all([
      svc.intent(code, tokenA, { baseRevision: base, intent: { type: "pegar", instanceId: bricks[0].id } }),
      svc.intent(code, tokenB, { baseRevision: base, intent: { type: "pegar", instanceId: bricks[1].id } }),
    ]);
    assert.equal([left, right].filter((result) => result.ok).length, 1);
    const missed = [left, right].find((result) => !result.ok)!;
    assert.equal(missed.motivo, "REVISAO_ANTIGA");
    const missedId = left.ok ? bricks[1].id : bricks[0].id;
    assert.equal(piece(missed.room!.law, missedId).holder, "mesa");
  });

  it("quem volta lê a sala atual e não escreve a tela velha", async () => {
    const svc = createRoomService(repo, () => 30_000);
    const { code, hostSecret, tokenA, tokenB } = await trio(svc);
    const before = must(await svc.read(code, tokenB, null));
    const stale = structuredClone(before.law);
    stale.revision = 0;
    for (const item of stale.instances) {
      if (item.holder === "mesa") item.holder = 1;
    }
    const brickId = idNaMesa(before.law, "bloco_2x2");
    const revisionBefore = before.roomRevision;
    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: brickId });
    const back = await svc.reconnect(code, tokenB, {
      law: stale,
      phase: "espera",
      roomRevision: 0,
      startedAt: null,
    });
    const room = must(back);
    assert.equal(piece(room.law, brickId).holder, 0);
    assert.equal(room.phase, "construindo");
    assert.equal(room.roomRevision, revisionBefore + 1);
    const again = must(await svc.read(code, tokenA, hostSecret));
    assert.equal(again.roomRevision, room.roomRevision);
    assert.equal(piece(again.law, brickId).holder, 0);
    assert.equal(
      again.law.instances.filter((item) => item.holder === 1 && item.defId !== "base_12x12").length,
      0,
    );
  });

  it("o tempo acaba pelo começou_em da sala, não por uma tela", async () => {
    let now = 50_000;
    const svc = createRoomService(repo, () => now);
    const { code, hostSecret, tokenA, tokenB } = await trio(svc);
    const started = must(await svc.read(code, tokenA, hostSecret));
    assert.equal(started.phase, "construindo");
    assert.equal(started.startedAt, 50_000);
    assert.equal(started.serverNow, 50_000);

    const early = await svc.intent(code, tokenB, {
      baseRevision: started.law.revision,
      intent: { type: "pegar", instanceId: idNaMesa(started.law, "bloco_1x2") },
    });
    assert.equal(early.ok, true);

    now = 50_000 + MATCH_MS;
    const closed = must(await svc.read(code, tokenB, null));
    assert.equal(closed.phase, "exposicao");
    assert.equal(closed.startedAt, 50_000);
    const blocked = await svc.intent(code, tokenA, {
      baseRevision: closed.law.revision,
      intent: { type: "pegar", instanceId: idNaMesa(closed.law, "bloco_1x4") },
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.motivo, "FORA_DE_FASE");
    assert.equal(blocked.room?.law.revision, closed.law.revision);
    assert.equal(blocked.room?.phase, "exposicao");

    await pg.query(
      "update legro_rooms set document = jsonb_set(document, '{phase}', '\"construindo\"') where code = $1",
      [code],
    );
    const repaired = must(await svc.read(code, tokenA, null));
    assert.equal(repaired.phase, "exposicao");
    const still = await svc.intent(code, tokenA, {
      baseRevision: repaired.law.revision,
      intent: { type: "pegar", instanceId: idNaMesa(repaired.law, "placa_1x2") },
    });
    assert.equal(still.motivo, "FORA_DE_FASE");
  });

  it("empréstimo: a mesma peça muda de mão e o histórico guarda o fato", async () => {
    const svc = createRoomService(repo, () => 80_000);
    const { code, hostSecret, tokenA, tokenB, tokenC } = await trio(svc);
    const early = await svc.requestLoan(code, tokenB, "nao-existe", 0);
    assert.equal(early.motivo, "PECA_DESCONHECIDA");

    const beforeStart = createRoomService(repo, () => 80_000);
    const parked = await beforeStart.create(0);
    const parkedRoom = must(parked);
    const parkedPiece = idNaMesa(parkedRoom.law, "roda_pequena");
    const tooSoon = await beforeStart.requestLoan(parkedRoom.code, parked.seatToken!, parkedPiece, 0);
    assert.equal(tooSoon.motivo, "FORA_DE_FASE");
    assert.equal(shown(tooSoon).history.length, 0);

    const open = must(await svc.read(code, tokenA, hostSecret));
    const id = idNaMesa(open.law, "bloco_2x2");
    const cor = piece(open.law, id).cor;
    const count = open.law.instances.length;
    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: id });

    const own = await svc.requestLoan(code, tokenA, id, 0);
    assert.equal(own.motivo, "POSSE_PROPRIA");
    const tableAsk = await svc.requestLoan(code, tokenB, idNaMesa(shown(own).law, "roda_grande"), 0);
    assert.equal(tableAsk.motivo, "PECA_NA_MESA");

    const [first, second] = await Promise.all([
      svc.requestLoan(code, tokenB, id, 0),
      svc.requestLoan(code, tokenC, id, 0),
    ]);
    const winners = [first, second].filter((item) => item.ok);
    const losers = [first, second].filter((item) => !item.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.ok(losers[0]?.motivo === "EMPRESTIMO_PENDENTE" || losers[0]?.motivo === "REVISAO_ANTIGA");
    const pendingRoom = must(winners[0]!.ok ? winners[0]! : losers[0]!);
    const pending = pendingRoom.loans.filter((item) => item.pieceId === id && item.status === "pendente");
    if (losers[0]?.motivo === "REVISAO_ANTIGA") {
      const retry = await svc.requestLoan(code, losers[0] === second ? tokenC : tokenB, id, 0);
      assert.equal(retry.motivo, "EMPRESTIMO_PENDENTE");
    }
    assert.equal(pending.length, 1);
    const loanId = pending[0]!.id;
    assert.equal(piece(pendingRoom.law, id).holder, 0);
    assert.equal(piece(pendingRoom.law, id).cor, cor);
    assert.equal(pendingRoom.law.instances.length, count);
    const asked = pendingRoom.history.find((item) => item.type === "EMPRESTIMO_SOLICITADO" && item.pieceId === id);
    assert.ok(asked);
    assert.equal(asked?.posseDe, 0);
    assert.equal(asked?.at, 80_000);
    assert.equal(asked?.roomRevision, pendingRoom.roomRevision);

    const stranger = await svc.answerLoan(code, tokenC, loanId, true);
    assert.equal(stranger.motivo, "NAO_E_O_DONO");

    const away = must(
      await svc.reconnect(code, tokenA, {
        loans: [],
        history: [],
        law: { revision: 0, instances: [], connections: [], log: [] },
      }),
    );
    assert.equal(away.loans.some((item) => item.id === loanId && item.status === "pendente"), true);
    assert.equal(piece(away.law, id).holder, 0);
    assert.equal(JSON.stringify(away).includes(tokenA), false);

    await act(svc, code, tokenA, hostSecret, {
      type: "encaixar",
      instanceId: id,
      pose: { x: 0, y: 1, z: 0, yaw: 0 },
    });
    const mountedAsk = await svc.requestLoan(code, tokenC, id, 0);
    assert.equal(mountedAsk.motivo, "PECA_MONTADA");
    const whileUp = await svc.answerLoan(code, tokenA, loanId, true);
    assert.equal(whileUp.motivo, "PECA_MONTADA");
    assert.equal(piece(shown(whileUp).law, id).holder, 0);
    assert.equal(shown(whileUp).loans.find((item) => item.id === loanId)?.status, "pendente");

    await act(svc, code, tokenA, hostSecret, { type: "desmontar", instanceId: id });
    const afterDown = must(await svc.read(code, tokenB, null));
    assert.equal(piece(afterDown.law, id).holder, 0);
    assert.equal(piece(afterDown.law, id).pose, null);
    assert.equal(afterDown.loans.find((item) => item.id === loanId)?.status, "pendente");
    assert.equal(afterDown.law.instances.filter((item) => item.id === id).length, 1);

    const winner = first.ok ? { token: tokenB, x: 16 } : { token: tokenC, x: 32 };
    const accepted = must(await svc.answerLoan(code, tokenA, loanId, true));
    assert.equal(piece(accepted.law, id).holder, first.ok ? 1 : 2);
    assert.equal(piece(accepted.law, id).id, id);
    assert.equal(piece(accepted.law, id).cor, cor);
    assert.equal(accepted.law.instances.length, count);
    const passed = accepted.history.find((item) => item.type === "EMPRESTIMO_ACEITO" && item.pieceId === id);
    assert.equal(passed?.pedidoPor, accepted.loans.find((item) => item.id === loanId)?.to);
    assert.equal(passed?.posseDe, 0);
    assert.equal(passed?.decididoPor, 0);
    assert.equal(passed?.roomRevision, accepted.roomRevision);
    assert.equal(passed?.lawRevision, accepted.law.revision);
    assert.equal(JSON.stringify(accepted).includes("generoso"), false);
    assert.equal(JSON.stringify(accepted).includes("pontos"), false);

    const staleHolder = await svc.requestLoan(code, tokenA, id, 0);
    assert.equal(staleHolder.motivo, "POSSE_MUDOU");
    assert.equal(piece(shown(staleHolder).law, id).holder, first.ok ? 1 : 2);

    await act(svc, code, winner.token, null, {
      type: "encaixar",
      instanceId: id,
      pose: { x: winner.x, y: 1, z: 0, yaw: 0 },
    });
    const inBuild = await svc.returnLoan(code, winner.token, id);
    assert.equal(inBuild.motivo, "PECA_MONTADA");
    await act(svc, code, winner.token, null, { type: "desmontar", instanceId: id });
    const returned = must(await svc.returnLoan(code, winner.token, id));
    assert.equal(piece(returned.law, id).holder, 0);
    assert.equal(piece(returned.law, id).cor, cor);
    assert.equal(returned.law.instances.filter((item) => item.id === id).length, 1);
    assert.equal(returned.history.at(-1)?.type, "EMPRESTIMO_DEVOLVIDO");
    assert.equal(returned.history.at(-1)?.roomRevision, returned.roomRevision);
    assert.equal(returned.loans.find((item) => item.id === loanId)?.status, "devolvido");

    const again = must(await svc.requestLoan(code, tokenB, id, 0));
    const loanAgain = again.loans.find((item) => item.pieceId === id && item.status === "pendente");
    assert.ok(loanAgain);
    await svc.answerLoan(code, tokenA, loanAgain.id, true);
    const toTable = await act(svc, code, tokenB, null, { type: "devolver", instanceId: id });
    assert.equal(piece(toTable.law, id).holder, "mesa");
    assert.equal(toTable.history.at(-1)?.type, "EMPRESTIMO_DEVOLVIDO_A_MESA");
    assert.equal(toTable.history.at(-1)?.pieceId, id);
    assert.equal(toTable.loans.find((item) => item.id === loanAgain.id)?.status, "devolvido_a_mesa");
    const seenByA = must(await svc.read(code, tokenA, hostSecret));
    assert.equal(piece(seenByA.law, id).holder, "mesa");
    assert.equal(seenByA.roomRevision, toTable.roomRevision);
  });

  it("recusa e peça que sai da mão antes da resposta", async () => {
    const svc = createRoomService(repo, () => 90_000);
    const { code, hostSecret, tokenA, tokenB } = await trio(svc);
    const open = must(await svc.read(code, tokenA, hostSecret));
    const id = idNaMesa(open.law, "bloco_1x1");
    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: id });
    const asked = must(await svc.requestLoan(code, tokenB, id, 0));
    const loanId = asked.loans.find((item) => item.status === "pendente" && item.pieceId === id)?.id;
    if (!loanId) throw new Error("sem pedido");
    const refused = must(await svc.answerLoan(code, tokenA, loanId, false));
    assert.equal(piece(refused.law, id).holder, 0);
    assert.equal(refused.loans.find((item) => item.id === loanId)?.status, "recusado");
    assert.equal(refused.history.at(-1)?.type, "EMPRESTIMO_RECUSADO");
    assert.equal(refused.history.at(-1)?.decididoPor, 0);
    assert.equal(refused.history.at(-1)?.roomRevision, refused.roomRevision);

    const askedAgain = must(await svc.requestLoan(code, tokenB, id, 0));
    const second = askedAgain.loans.find((item) => item.status === "pendente" && item.pieceId === id);
    if (!second) throw new Error("sem segundo pedido");
    const dropped = await act(svc, code, tokenA, hostSecret, { type: "devolver", instanceId: id });
    assert.equal(piece(dropped.law, id).holder, "mesa");
    assert.equal(dropped.loans.find((item) => item.id === second.id)?.status, "indisponivel");
    assert.equal(dropped.history.at(-1)?.type, "EMPRESTIMO_INDISPONIVEL");
    assert.equal(dropped.history.at(-1)?.posseDe, 0);
    assert.equal(dropped.history.at(-1)?.roomRevision, dropped.roomRevision);
    const late = await svc.answerLoan(code, tokenA, second.id, true);
    assert.equal(late.motivo, "JA_RESPONDIDO");
    assert.equal(piece(shown(late).law, id).holder, "mesa");
    assert.equal(shown(late).law.instances.filter((item) => item.id === id).length, 1);
  });

  it("exposição congela as três construções e recusa qualquer ação", async () => {
    let now = 10_000;
    const svc = createRoomService(repo, () => now);
    const { code, hostSecret, tokenA, tokenB, tokenC } = await trio(svc);
    const open = must(await svc.read(code, tokenA, hostSecret));
    const brickA = idNaMesa(open.law, "bloco_2x2");
    const brickB = idNaMesa(open.law, "bloco_1x2");
    const brickC = idNaMesa(open.law, "bloco_1x4");
    const heldB = idNaMesa(open.law, "bloco_1x1");
    const heldA = idNaMesa(open.law, "roda_pequena");

    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: brickA });
    await act(svc, code, tokenA, hostSecret, {
      type: "encaixar",
      instanceId: brickA,
      pose: { x: 0, y: 1, z: 0, yaw: 0 },
    });
    await act(svc, code, tokenA, hostSecret, { type: "pegar", instanceId: heldA });
    await act(svc, code, tokenB, null, { type: "pegar", instanceId: brickB });
    await act(svc, code, tokenB, null, {
      type: "encaixar",
      instanceId: brickB,
      pose: { x: 16, y: 1, z: 0, yaw: 0 },
    });
    await act(svc, code, tokenB, null, { type: "pegar", instanceId: heldB });
    await act(svc, code, tokenC, null, { type: "pegar", instanceId: brickC });
    await act(svc, code, tokenC, null, {
      type: "encaixar",
      instanceId: brickC,
      pose: { x: 32, y: 1, z: 0, yaw: 0 },
    });
    const asked = must(await svc.requestLoan(code, tokenC, heldB, 1));
    const loanId = asked.loans.find((item) => item.pieceId === heldB && item.status === "pendente")?.id;
    if (!loanId) throw new Error("pedido não nasceu");

    now = 10_000 + MATCH_MS - 1;
    const stillOpen = await svc.intent(code, tokenC, {
      baseRevision: asked.law.revision,
      intent: { type: "pegar", instanceId: idNaMesa(asked.law, "placa_1x2") },
    });
    assert.equal(stillOpen.ok, true);
    const plate = idNaMesa(asked.law, "placa_1x2");
    assert.equal(piece(must(stillOpen).law, plate).holder, 2);

    const beforeClose = must(stillOpen);
    const leiAntes = {
      revision: beforeClose.law.revision,
      instances: beforeClose.law.instances,
      connections: beforeClose.law.connections,
      log: beforeClose.law.log,
    };

    now = 10_000 + MATCH_MS;
    const closed = must(await svc.read(code, tokenA, hostSecret));
    assert.equal(closed.phase, "exposicao");
    assert.equal(closed.closedAt, now);
    assert.equal(closed.report?.closedAt, now);
    assert.equal(closed.report?.startedAt, 10_000);
    assert.equal(closed.report?.durationMs, MATCH_MS);
    assert.equal(closed.report?.lawRevision, beforeClose.law.revision);
    assert.deepEqual(
      {
        revision: closed.law.revision,
        instances: closed.law.instances,
        connections: closed.law.connections,
        log: closed.law.log,
      },
      leiAntes,
    );
    assert.equal(piece(closed.law, brickA).pose?.x, 0);
    assert.equal(piece(closed.law, brickB).pose?.x, 16);
    assert.equal(piece(closed.law, brickC).pose?.x, 32);
    assert.equal(piece(closed.law, heldA).holder, 0);
    assert.equal(piece(closed.law, heldA).pose, null);
    assert.equal(piece(closed.law, heldB).holder, 1);
    assert.equal(piece(closed.law, plate).holder, 2);
    assert.equal(closed.loans.find((item) => item.id === loanId)?.status, "sem_resposta");
    assert.equal(closed.history.at(-1)?.type, "EMPRESTIMO_SEM_RESPOSTA");
    assert.equal(closed.history.at(-1)?.decididoPor, null);
    assert.equal(closed.history.at(-1)?.pieceId, heldB);
    assert.deepEqual(closed.report?.pedidosEncerradosSemResposta, [loanId]);
    const text = JSON.stringify(closed.report);
    for (const word of ["criatividade", "empatia", "estratégia", "estrategia", "beleza", "vencedor", "ranking", "pontos"]) {
      assert.equal(text.includes(word), false, word);
    }
    const c0 = closed.report?.cadeiras[0];
    const c1 = closed.report?.cadeiras[1];
    const c2 = closed.report?.cadeiras[2];
    assert.equal(c0?.pecasNaConstrucao, 1);
    assert.equal(c0?.pecasNaMao, 1);
    assert.equal(c0?.profundidadeMaxima, 1);
    assert.equal(c0?.pecas[0]?.id, brickA);
    assert.equal(c1?.pecasNaConstrucao, 1);
    assert.equal(c1?.pecasNaMao, 1);
    assert.equal(c1?.pecas[0]?.id, brickB);
    assert.equal(c2?.pecasNaConstrucao, 1);
    assert.equal(c2?.pecasNaMao, 1);
    assert.equal(c2?.pedidosRealizados, 1);
    assert.equal(c2?.pedidosRecusados, 0);
    assert.ok((closed.report?.historicoLei.length ?? 0) > 0);
    assert.equal(
      closed.report?.pecasNoEncerramento.find((item) => item.id === brickA)?.pose?.y,
      1,
    );
    assert.equal(closed.report?.pecasNoEncerramento.find((item) => item.id === heldB)?.holder, 1);

    const foto = {
      law: closed.law,
      loans: closed.loans,
      history: closed.history,
      report: closed.report,
      revision: closed.roomRevision,
    };
    const again = must(await svc.read(code, tokenB, null));
    assert.equal(again.roomRevision, closed.roomRevision);
    assert.deepEqual(
      {
        law: again.law,
        loans: again.loans,
        history: again.history,
        report: again.report,
        revision: again.roomRevision,
      },
      foto,
    );

    const blocked = [
      svc.intent(code, tokenA, {
        baseRevision: closed.law.revision,
        intent: { type: "pegar", instanceId: idNaMesa(closed.law, "roda_grande") },
      }),
      svc.intent(code, tokenA, {
        baseRevision: closed.law.revision,
        intent: { type: "devolver", instanceId: heldA },
      }),
      svc.intent(code, tokenA, {
        baseRevision: closed.law.revision,
        intent: { type: "desmontar", instanceId: brickA },
      }),
      svc.intent(code, tokenC, {
        baseRevision: closed.law.revision,
        intent: { type: "encaixar", instanceId: plate, pose: { x: 32, y: 1, z: 2, yaw: 0 } },
      }),
      svc.requestLoan(code, tokenA, heldB, 1),
      svc.answerLoan(code, tokenB, loanId, true),
      svc.answerLoan(code, tokenB, loanId, false),
      svc.returnLoan(code, tokenC, heldB),
      svc.requestJoin(code, 1),
      svc.start(code, hostSecret),
    ];
    const results = await Promise.all(blocked);
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.ok(result.motivo === "FORA_DE_FASE" || result.motivo === "JA_COMECOU" || result.motivo === "CADEIRA_OCUPADA");
      if (!result.room) continue;
      assert.deepEqual(
        {
          law: result.room.law,
          loans: result.room.loans,
          history: result.room.history,
          report: result.room.report,
          revision: result.room.roomRevision,
        },
        foto,
      );
    }
    const after = must(await svc.read(code, tokenC, null));
    assert.equal(after.phase, "exposicao");
    assert.deepEqual(
      {
        law: after.law,
        loans: after.loans,
        history: after.history,
        report: after.report,
        revision: after.roomRevision,
      },
      foto,
    );
    assert.equal(piece(after.law, brickA).pose?.x, 0);
    assert.equal(piece(after.law, brickB).pose?.x, 16);
    assert.equal(piece(after.law, brickC).pose?.x, 32);
    assert.equal(after.loans.find((item) => item.id === loanId)?.status, "sem_resposta");

    await pg.query(
      "update legro_rooms set document = jsonb_set(document, '{phase}', '\"construindo\"') where code = $1",
      [code],
    );
    const forced = [
      svc.intent(code, tokenB, {
        baseRevision: after.law.revision,
        intent: { type: "desmontar", instanceId: brickB },
      }),
      svc.intent(code, tokenA, {
        baseRevision: after.law.revision,
        intent: { type: "encaixar", instanceId: heldA, pose: { x: 0, y: 2, z: 0, yaw: 0 } },
      }),
      svc.requestLoan(code, tokenC, heldA, 0),
    ];
    for (const result of await Promise.all(forced)) {
      assert.equal(result.ok, false);
      assert.equal(result.motivo, "FORA_DE_FASE");
    }
    const repaired = must(await svc.read(code, tokenA, hostSecret));
    assert.equal(repaired.phase, "exposicao");
    assert.equal(piece(repaired.law, brickA).id, brickA);
    assert.equal(piece(repaired.law, brickB).pose?.y, 1);
    assert.equal(piece(repaired.law, heldA).holder, 0);
    assert.equal(piece(repaired.law, heldB).holder, 1);
    assert.equal(repaired.law.revision, beforeClose.law.revision);
    assert.equal(repaired.loans.find((item) => item.id === loanId)?.status, "sem_resposta");
  });
});

async function trio(svc: RoomService) {
  const created = await svc.create(0);
  const room = must(created);
  const hostSecret = created.hostSecret;
  const tokenA = created.seatToken;
  if (!hostSecret || !tokenA) throw new Error("sem credencial do anfitrião");
  const askB = await svc.requestJoin(room.code, 1);
  const askC = await svc.requestJoin(room.code, 2);
  if (!askB.requestId || !askB.requestSecret || !askC.requestId || !askC.requestSecret) {
    throw new Error(askB.motivo ?? askC.motivo ?? "pedido");
  }
  await svc.answer(room.code, hostSecret, askB.requestId, true);
  await svc.answer(room.code, hostSecret, askC.requestId, true);
  const tokenB = (await svc.pollJoin(room.code, askB.requestId, askB.requestSecret)).seatToken;
  const tokenC = (await svc.pollJoin(room.code, askC.requestId, askC.requestSecret)).seatToken;
  if (!tokenB || !tokenC) throw new Error("cadeira sem token");
  const started = await svc.start(room.code, hostSecret);
  if (!started.ok || started.room?.phase !== "construindo") throw new Error(started.motivo ?? "não começou");
  return { code: room.code, hostSecret, tokenA, tokenB, tokenC };
}

async function act(svc: RoomService, code: string, token: string, hostSecret: string | null, intent: ClientIntent) {
  const seen = must(await svc.read(code, token, hostSecret));
  const result = await svc.intent(code, token, { baseRevision: seen.law.revision, intent });
  if (!result.ok || !result.room) throw new Error(`${intent.type} ${result.motivo}`);
  return result.room;
}
