import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "./initial-state.ts";
import { answerPiece, askPiece, returnPiece } from "./loan.ts";
import { applyIntent } from "./reducer.ts";
import { buildReport, closePendingForExhibition } from "./report.ts";
import type { Chair, RoomState } from "./types.ts";

function mesa(state: RoomState, defId: string) {
  const found = state.instances.find((item) => item.defId === defId && item.holder === "mesa");
  if (!found) throw new Error(defId);
  return found;
}

function step(state: RoomState, chair: Chair, type: "pegar" | "devolver" | "desmontar", id: string) {
  const result = applyIntent(state, { baseRevision: state.revision, intent: { type, chair, instanceId: id } });
  if (!result.ok) throw new Error(result.motivo);
  return result.state;
}

describe("relatório factual", () => {
  it("conta o que aconteceu e não cria nota", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_2x2");
    const small = mesa(law, "bloco_1x1");
    law = step(law, 0, "pegar", brick.id);
    const placed = applyIntent(law, {
      baseRevision: law.revision,
      intent: { type: "encaixar", chair: 0, instanceId: brick.id, pose: { x: 0, y: 1, z: 0, yaw: 0 } },
    });
    if (!placed.ok) throw new Error(placed.motivo);
    law = step(placed.state, 0, "desmontar", brick.id);
    const again = applyIntent(law, {
      baseRevision: law.revision,
      intent: { type: "encaixar", chair: 0, instanceId: brick.id, pose: { x: 0, y: 1, z: 0, yaw: 0 } },
    });
    if (!again.ok) throw new Error(again.motivo);
    law = step(again.state, 0, "pegar", small.id);
    const asked = askPiece(law, [], [], 1, small.id, 0, 10, 3, "emp-1");
    const accepted = answerPiece(asked.law, asked.loans, asked.history, 0, "emp-1", true, 11, 4);
    const returned = returnPiece(accepted.law, accepted.loans, accepted.history, 1, small.id, 12, 5);
    law = step(returned.law, 0, "devolver", small.id);
    const history = returned.history;

    const before = JSON.stringify(law.instances);
    const report = buildReport({
      law,
      history,
      roomRevision: 9,
      startedAt: 1_000,
      closedAt: 2_000,
      durationMs: 1_000,
      closedLoanIds: [],
    });
    const againReport = buildReport({
      law,
      history,
      roomRevision: 9,
      startedAt: 1_000,
      closedAt: 2_000,
      durationMs: 1_000,
      closedLoanIds: [],
    });
    assert.equal(JSON.stringify(report), JSON.stringify(againReport));
    assert.equal(JSON.stringify(law.instances), before);
    const text = JSON.stringify(report);
    for (const word of ["criatividade", "empatia", "pontos", "vencedor", "ranking", "beleza"]) {
      assert.equal(text.includes(word), false);
    }

    const a = report.cadeiras[0]!;
    const b = report.cadeiras[1]!;
    const c = report.cadeiras[2]!;
    assert.equal(a.pecasNaConstrucao, 1);
    assert.equal(a.pecas[0]?.id, brick.id);
    assert.deepEqual(a.familias, ["bloco"]);
    assert.equal(a.tiposDiferentes, 1);
    assert.equal(a.profundidadeMaxima, 1);
    assert.equal(a.pecas[0]?.profundidade, 1);
    assert.equal(a.pecas[0]?.pose.y, 1);
    assert.ok(a.conexoes > 0);
    assert.equal(a.pecasReutilizadas, 1);
    assert.equal(a.desmontagens, 1);
    assert.equal(a.emprestimosRealizados, 1);
    assert.equal(a.emprestimosRecebidos, 0);
    assert.equal(a.pedidosRealizados, 0);
    assert.equal(a.pedidosRecusados, 0);
    assert.equal(a.pecasDevolvidasAMesa, 1);
    assert.equal(a.pecasDevolvidasAoDono, 0);
    assert.equal(a.pecasNaMao, 0);
    assert.equal(a.eventosRelevantes, 9);
    assert.equal(b.emprestimosRecebidos, 1);
    assert.equal(b.pedidosRealizados, 1);
    assert.equal(b.pecasDevolvidasAoDono, 1);
    assert.equal(b.pecasNaConstrucao, 0);
    assert.equal(b.eventosRelevantes, 3);
    assert.equal(c.eventosRelevantes, 0);
    assert.equal(c.pecasNaConstrucao, 0);
    assert.equal(report.historicoLei.some((event) => event.tipo === "encaixou" && event.instanceId === brick.id), true);
    const mounted = report.historicoLei.find((event) => event.tipo === "encaixou" && event.instanceId === brick.id);
    assert.equal(mounted?.pose?.y, 1);
    assert.equal(typeof mounted?.encaixes, "number");
    const frozenBrick = report.pecasNoEncerramento.find((item) => item.id === brick.id);
    const frozenSmall = report.pecasNoEncerramento.find((item) => item.id === small.id);
    assert.equal(frozenBrick?.holder, 0);
    assert.equal(frozenBrick?.pose?.y, 1);
    assert.equal(frozenSmall?.holder, "mesa");
    assert.equal(frozenSmall?.pose, null);
    assert.equal(report.conexoesNoEncerramento.length, law.connections.length);
    assert.equal(report.historicoEmprestimos.at(-1)?.type, "EMPRESTIMO_DEVOLVIDO");
    assert.equal(report.lawRevision, law.revision);
  });

  it("encerra pedido pendente sem mover a peça", () => {
    let law = createInitialState();
    const brick = mesa(law, "bloco_1x1");
    law = step(law, 0, "pegar", brick.id);
    const asked = askPiece(law, [], [], 1, brick.id, 0, 5, 2, "emp-z");
    const snapshot = JSON.stringify(law.instances);
    const closed = closePendingForExhibition(asked.loans, asked.history, 99, 8, law.revision);
    assert.deepEqual(closed.closedIds, ["emp-z"]);
    assert.equal(closed.loans[0]?.status, "sem_resposta");
    assert.equal(closed.history.at(-1)?.type, "EMPRESTIMO_SEM_RESPOSTA");
    assert.equal(closed.history.at(-1)?.decididoPor, null);
    assert.equal(closed.history.at(-1)?.roomRevision, 8);
    assert.equal(closed.history.at(-1)?.lawRevision, law.revision);
    assert.equal(JSON.stringify(law.instances), snapshot);
    const twice = closePendingForExhibition(closed.loans, closed.history, 100, 9, law.revision);
    assert.equal(twice.closedIds.length, 0);
    assert.equal(twice.history.length, closed.history.length);
  });
});
