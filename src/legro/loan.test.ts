import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "./initial-state.ts";
import { answerPiece, askPiece, returnPiece, settleAfterLaw } from "./loan.ts";
import { applyIntent } from "./reducer.ts";
import type { Chair, RoomState } from "./types.ts";

function mesa(state: RoomState, defId: string) {
  const found = state.instances.find((item) => item.defId === defId && item.holder === "mesa");
  if (!found) throw new Error(defId);
  return found;
}

function mustPiece(state: RoomState, id: string) {
  const found = state.instances.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

function sameIdentity(before: RoomState, after: RoomState, id: string) {
  assert.equal(after.instances.length, before.instances.length);
  assert.equal(new Set(after.instances.map((item) => item.id)).size, after.instances.length);
  assert.equal(after.instances.filter((item) => item.id === id).length, 1);
  assert.equal(mustPiece(after, id).defId, mustPiece(before, id).defId);
  assert.equal(mustPiece(after, id).cor, mustPiece(before, id).cor);
}

function pegar(state: RoomState, chair: Chair, id: string) {
  const result = applyIntent(state, { baseRevision: state.revision, intent: { type: "pegar", chair, instanceId: id } });
  if (!result.ok) throw new Error(result.motivo);
  return result.state;
}

describe("empréstimo é fato de posse", () => {
  it("não copia a instância: pedir, aceitar e devolver ao dono", () => {
    let law = createInitialState();
    const wheel = mesa(law, "roda_grande");
    const id = wheel.id;
    const cor = wheel.cor;
    law = pegar(law, 0, id);
    const asked = askPiece(law, [], [], 1, id, 0, 5_000, 4, "emp-1");
    assert.equal(asked.ok, true);
    assert.equal(asked.law, law);
    assert.equal(mustPiece(asked.law, id).holder, 0);
    assert.equal(asked.history[0]?.type, "EMPRESTIMO_SOLICITADO");
    assert.equal(asked.history[0]?.pedidoPor, 1);
    assert.equal(asked.history[0]?.posseDe, 0);
    assert.equal(asked.history[0]?.pieceId, id);
    assert.equal(asked.history[0]?.roomRevision, 4);
    assert.equal(asked.history[0]?.at, 5_000);

    const again = askPiece(asked.law, asked.loans, asked.history, 2, id, 0, 5_000, 5, "emp-2");
    assert.equal(again.ok, false);
    assert.equal(again.motivo, "EMPRESTIMO_PENDENTE");
    assert.equal(again.write, false);
    assert.equal(again.loans.length, 1);

    const accepted = answerPiece(asked.law, asked.loans, asked.history, 0, "emp-1", true, 5_100, 5);
    assert.equal(accepted.ok, true);
    sameIdentity(law, accepted.law, id);
    assert.equal(mustPiece(accepted.law, id).holder, 1);
    assert.equal(mustPiece(accepted.law, id).pose, null);
    assert.equal(mustPiece(accepted.law, id).cor, cor);
    assert.equal(accepted.history.at(-1)?.type, "EMPRESTIMO_ACEITO");
    assert.equal(accepted.history.at(-1)?.decididoPor, 0);
    assert.equal(accepted.history.at(-1)?.lawRevision, accepted.law.revision);
    assert.equal(accepted.loans[0]?.status, "aceito");

    const back = returnPiece(accepted.law, accepted.loans, accepted.history, 1, id, 5_200, 6);
    assert.equal(back.ok, true);
    sameIdentity(law, back.law, id);
    assert.equal(mustPiece(back.law, id).holder, 0);
    assert.equal(back.history.at(-1)?.type, "EMPRESTIMO_DEVOLVIDO");
    assert.equal(back.loans[0]?.status, "devolvido");
  });

  it("recusar não muda a posse e não julga", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_1x1");
    law = pegar(law, 0, brick.id);
    const asked = askPiece(law, [], [], 1, brick.id, 0, 1, 2, "emp-r");
    const refused = answerPiece(asked.law, asked.loans, asked.history, 0, "emp-r", false, 2, 3);
    assert.equal(refused.ok, true);
    assert.equal(mustPiece(refused.law, brick.id).holder, 0);
    assert.equal(refused.law.revision, law.revision);
    assert.equal(refused.history.at(-1)?.type, "EMPRESTIMO_RECUSADO");
    assert.equal(JSON.stringify(refused.history).includes("generoso"), false);
    assert.equal(JSON.stringify(refused.history).includes("egoísta"), false);
    assert.equal(JSON.stringify(refused).includes("pontos"), false);
  });

  it("peça montada, mesa, própria mão e posse que já mudou", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_2x2");
    const onTable = askPiece(law, [], [], 1, brick.id, 0, 1, 2, "x");
    assert.equal(onTable.motivo, "PECA_NA_MESA");
    assert.equal(onTable.write, false);

    law = pegar(law, 0, brick.id);
    assert.equal(askPiece(law, [], [], 0, brick.id, 0, 1, 2, "x").motivo, "POSSE_PROPRIA");

    const placed = applyIntent(law, {
      baseRevision: law.revision,
      intent: { type: "encaixar", chair: 0, instanceId: brick.id, pose: { x: 0, y: 1, z: 0, yaw: 0 } },
    });
    if (!placed.ok) throw new Error(placed.motivo);
    assert.equal(askPiece(placed.state, [], [], 1, brick.id, 0, 1, 2, "x").motivo, "PECA_MONTADA");

    const asked = askPiece(law, [], [], 1, brick.id, 0, 1, 2, "emp-m");
    const mounted = answerPiece(placed.state, asked.loans, asked.history, 0, "emp-m", true, 2, 3);
    assert.equal(mounted.motivo, "PECA_MONTADA");
    assert.equal(mounted.write, false);
    assert.equal(mounted.loans[0]?.status, "pendente");
    assert.equal(mustPiece(mounted.law, brick.id).holder, 0);

    const moved = {
      ...law,
      instances: law.instances.map((item) => (item.id === brick.id ? { ...item, holder: 2 as const } : item)),
    };
    const stale = answerPiece(moved, asked.loans, asked.history, 0, "emp-m", true, 2, 3);
    assert.equal(stale.motivo, "POSSE_MUDOU");
    assert.equal(stale.write, true);
    assert.equal(stale.loans[0]?.status, "indisponivel");
    assert.equal(mustPiece(stale.law, brick.id).holder, 2);
    sameIdentity(law, stale.law, brick.id);
    assert.equal(askPiece(moved, [], [], 1, brick.id, 0, 1, 2, "x").motivo, "POSSE_MUDOU");
  });

  it("desmontar no meio do pedido devolve a mesma instância, e a mesa encerra o empréstimo", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_2x2");
    law = pegar(law, 0, brick.id);
    const asked = askPiece(law, [], [], 1, brick.id, 0, 1, 2, "emp-d");
    const placed = applyIntent(law, {
      baseRevision: law.revision,
      intent: { type: "encaixar", chair: 0, instanceId: brick.id, pose: { x: 1, y: 1, z: 1, yaw: 0 } },
    });
    if (!placed.ok) throw new Error(placed.motivo);
    const kept = settleAfterLaw(placed.state, asked.loans, asked.history, 2, 3);
    assert.equal(kept.changed, false);
    assert.equal(kept.loans[0]?.status, "pendente");

    const down = applyIntent(placed.state, {
      baseRevision: placed.state.revision,
      intent: { type: "desmontar", chair: 0, instanceId: brick.id },
    });
    if (!down.ok) throw new Error(down.motivo);
    assert.equal(mustPiece(down.state, brick.id).holder, 0);
    assert.equal(mustPiece(down.state, brick.id).pose, null);
    const still = settleAfterLaw(down.state, asked.loans, asked.history, 3, 4);
    assert.equal(still.changed, false);

    const accepted = answerPiece(down.state, asked.loans, asked.history, 0, "emp-d", true, 4, 5);
    assert.equal(accepted.ok, true);
    assert.equal(mustPiece(accepted.law, brick.id).id, brick.id);
    assert.equal(mustPiece(accepted.law, brick.id).holder, 1);

    const built = applyIntent(accepted.law, {
      baseRevision: accepted.law.revision,
      intent: { type: "encaixar", chair: 1, instanceId: brick.id, pose: { x: 16, y: 1, z: 0, yaw: 0 } },
    });
    if (!built.ok) throw new Error(built.motivo);
    assert.equal(returnPiece(built.state, accepted.loans, accepted.history, 1, brick.id, 5, 6).motivo, "PECA_MONTADA");

    const loose = applyIntent(built.state, {
      baseRevision: built.state.revision,
      intent: { type: "desmontar", chair: 1, instanceId: brick.id },
    });
    if (!loose.ok) throw new Error(loose.motivo);
    const toTable = applyIntent(loose.state, {
      baseRevision: loose.state.revision,
      intent: { type: "devolver", chair: 1, instanceId: brick.id },
    });
    if (!toTable.ok) throw new Error(toTable.motivo);
    const settled = settleAfterLaw(toTable.state, accepted.loans, accepted.history, 6, 7);
    assert.equal(settled.loans[0]?.status, "devolvido_a_mesa");
    assert.equal(settled.history.at(-1)?.type, "EMPRESTIMO_DEVOLVIDO_A_MESA");
    assert.equal(mustPiece(toTable.state, brick.id).holder, "mesa");
    sameIdentity(law, toTable.state, brick.id);
  });

  it("devolver à mesa no meio do pedido encerra sem transferir", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_1x2");
    law = pegar(law, 0, brick.id);
    const asked = askPiece(law, [], [], 1, brick.id, 0, 1, 2, "emp-i");
    const dropped = applyIntent(law, {
      baseRevision: law.revision,
      intent: { type: "devolver", chair: 0, instanceId: brick.id },
    });
    if (!dropped.ok) throw new Error(dropped.motivo);
    const settled = settleAfterLaw(dropped.state, asked.loans, asked.history, 2, 3);
    assert.equal(settled.changed, true);
    assert.equal(settled.loans[0]?.status, "indisponivel");
    assert.equal(settled.history.at(-1)?.type, "EMPRESTIMO_INDISPONIVEL");
    assert.equal(settled.history.at(-1)?.roomRevision, 3);
    assert.equal(mustPiece(dropped.state, brick.id).holder, "mesa");
    const late = answerPiece(dropped.state, settled.loans, settled.history, 0, "emp-i", true, 3, 4);
    assert.equal(late.motivo, "JA_RESPONDIDO");
    assert.equal(late.write, false);
  });
});
