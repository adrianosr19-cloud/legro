import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BAG_IDS, CATALOG, STOCK } from "./catalog.ts";
import { createInitialState } from "./initial-state.ts";
import { applyIntent, applySerialized } from "./reducer.ts";
import {
  REJECT_REASONS,
  type ApplyResult,
  type Chair,
  type Pose,
  type RejectReason,
  type RoomState,
} from "./types.ts";

function must(result: ApplyResult): RoomState {
  if (!result.ok) throw new Error(result.motivo);
  return result.state;
}

function motivo(result: ApplyResult, expected: RejectReason): void {
  if (result.ok) throw new Error("esperava recusa");
  assert.equal(result.motivo, expected);
}

function pegar(state: RoomState, chair: Chair, defId: string): { state: RoomState; id: string } {
  const piece = state.instances.find(
    (item) => item.defId === defId && item.holder === "mesa" && item.pose === null,
  );
  assert.ok(piece, `sem ${defId} na mesa`);
  const state2 = must(
    applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "pegar", chair, instanceId: piece.id },
    }),
  );
  return { state: state2, id: piece.id };
}

function encaixar(state: RoomState, chair: Chair, id: string, pose: Pose): RoomState {
  return must(
    applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "encaixar", chair, instanceId: id, pose },
    }),
  );
}

function solta(state: RoomState, id: string): boolean {
  const piece = state.instances.find((item) => item.id === id);
  return !!piece && piece.pose === null && piece.cadeira === null;
}

describe("catálogo", () => {
  it("tem 18 tipos de sacola e uma base fixa", () => {
    assert.equal(BAG_IDS.length, 18);
    for (const id of BAG_IDS) {
      assert.equal(CATALOG[id]?.fixa, false);
      assert.ok(CATALOG[id]!.cells.length > 0);
      assert.ok(CATALOG[id]!.sockets.length > 0);
    }
    assert.equal(CATALOG.base_12x12?.fixa, true);
    assert.equal(STOCK.length, 18);
  });

  it("roda e eixo não têm soquete de bloco", () => {
    for (const id of ["roda_grande", "roda_pequena", "eixo_4"]) {
      assert.equal(
        CATALOG[id]!.sockets.some((s) => s.family === "bloco"),
        false,
      );
    }
    assert.equal(
      CATALOG.roda_grande!.sockets.some((s) => s.gender === "cubo"),
      true,
    );
    assert.equal(
      CATALOG.eixo_4!.sockets.some((s) => s.gender === "eixo"),
      true,
    );
    assert.equal(
      CATALOG.bloco_furo_eixo_2x2!.sockets.some((s) => s.gender === "furo"),
      true,
    );
  });
});

describe("sala inicial", () => {
  it("começa na revisão 0, com três bases e o saco na mesa", () => {
    const state = createInitialState();
    assert.equal(state.revision, 0);
    assert.equal(state.log.length, 0);
    assert.equal(state.connections.length, 0);
    for (const chair of [0, 1, 2] as Chair[]) {
      const base = state.instances.find((p) => p.id === `base-${chair}`);
      assert.ok(base);
      assert.equal(base.holder, "fixa");
      assert.equal(base.cadeira, chair);
      assert.ok(base.pose);
    }
    const bag = state.instances.filter((p) => p.holder === "mesa");
    assert.equal(
      bag.length,
      STOCK.reduce((sum, row) => sum + row.count, 0),
    );
  });
});

describe("encaixe", () => {
  it("bloco sobre a base e bloco sobre bloco", () => {
    let state = createInitialState();
    const a = pegar(state, 0, "bloco_2x4");
    state = encaixar(a.state, 0, a.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const b = pegar(state, 0, "bloco_2x2");
    state = encaixar(b.state, 0, b.id, { x: 0, y: 4, z: 0, yaw: 0 });
    const lower = state.instances.find((p) => p.id === a.id)!;
    const upper = state.instances.find((p) => p.id === b.id)!;
    assert.equal(lower.cadeira, 0);
    assert.equal(upper.cadeira, 0);
    assert.equal(
      state.connections.filter((c) => c.a.instanceId === a.id || c.b.instanceId === a.id).length >=
        8,
      true,
    );
    const topLink = state.connections.some(
      (c) =>
        (c.a.instanceId === a.id && c.b.instanceId === b.id) ||
        (c.a.instanceId === b.id && c.b.instanceId === a.id),
    );
    assert.equal(topLink, true);
    const placed = state.log.filter((e) => e.tipo === "encaixou");
    assert.equal(placed[0]?.encaixes, 8);
    assert.equal(placed[1]?.encaixes, 4);
  });

  it("placa encaixa em bloco", () => {
    let state = createInitialState();
    const brick = pegar(state, 0, "bloco_1x1");
    state = encaixar(brick.state, 0, brick.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const plate = pegar(state, 0, "placa_1x2");
    state = encaixar(plate.state, 0, plate.id, { x: 0, y: 4, z: 0, yaw: 0 });
    assert.equal(state.instances.find((p) => p.id === plate.id)?.pose?.y, 4);
  });

  it("roda não encaixa em bloco", () => {
    let state = createInitialState();
    const brick = pegar(state, 0, "bloco_2x4");
    state = encaixar(brick.state, 0, brick.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const wheel = pegar(state, 0, "roda_grande");
    const result = applyIntent(wheel.state, {
      baseRevision: wheel.state.revision,
      intent: {
        type: "encaixar",
        chair: 0,
        instanceId: wheel.id,
        pose: { x: 0, y: 6, z: 0, yaw: 0 },
      },
    });
    motivo(result, "ENCAIXE_INVALIDO");
    assert.equal(result.state.instances.find((p) => p.id === wheel.id)?.holder, 0);
    assert.equal(result.state.instances.find((p) => p.id === wheel.id)?.pose, null);
  });

  it("eixo não apoia em pino de bloco", () => {
    let state = createInitialState();
    const axle = pegar(state, 0, "eixo_4");
    motivo(
      applyIntent(axle.state, {
        baseRevision: axle.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: axle.id,
          pose: { x: 0, y: 1, z: 0, yaw: 0 },
        },
      }),
      "ENCAIXE_INVALIDO",
    );
  });

  it("roda encaixa no eixo, e o eixo só entra no furo", () => {
    let state = createInitialState();
    const brick = pegar(state, 0, "bloco_furo_eixo_2x2");
    state = encaixar(brick.state, 0, brick.id, { x: 6, y: 1, z: 0, yaw: 0 });
    const axle = pegar(state, 0, "eixo_4");
    const wrong = applyIntent(axle.state, {
      baseRevision: axle.state.revision,
      intent: {
        type: "encaixar",
        chair: 0,
        instanceId: axle.id,
        pose: { x: 6, y: 1, z: 0, yaw: 0 },
      },
    });
    motivo(wrong, "COLISAO");
    state = wrong.state;
    const axle2 = { state, id: axle.id };
    state = encaixar(axle2.state, 0, axle2.id, { x: 6, y: 2, z: 0, yaw: 0 });
    const wheel = pegar(state, 0, "roda_grande");
    state = encaixar(wheel.state, 0, wheel.id, { x: 9, y: 2, z: 0, yaw: 0 });
    const linked = state.connections.some(
      (c) =>
        (c.a.instanceId === axle.id && c.b.instanceId === wheel.id) ||
        (c.b.instanceId === axle.id && c.a.instanceId === wheel.id),
    );
    assert.equal(linked, true);
    assert.equal(state.instances.find((p) => p.id === wheel.id)?.cadeira, 0);
  });

  it("peças não se atravessam", () => {
    let state = createInitialState();
    const a = pegar(state, 0, "bloco_2x4");
    state = encaixar(a.state, 0, a.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const b = pegar(state, 0, "bloco_2x4");
    motivo(
      applyIntent(b.state, {
        baseRevision: b.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: b.id,
          pose: { x: 0, y: 1, z: 0, yaw: 0 },
        },
      }),
      "COLISAO",
    );
  });

  it("rampa ocupa o volume da cunha", () => {
    let state = createInitialState();
    const slope = pegar(state, 0, "rampa_2x2");
    state = encaixar(slope.state, 0, slope.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const brick = pegar(state, 0, "bloco_2x2");
    motivo(
      applyIntent(brick.state, {
        baseRevision: brick.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: brick.id,
          pose: { x: 0, y: 2, z: 0, yaw: 0 },
        },
      }),
      "COLISAO",
    );
  });

  it("peça sem caminho até a base é recusada", () => {
    let state = createInitialState();
    const brick = pegar(state, 0, "bloco_2x2");
    motivo(
      applyIntent(brick.state, {
        baseRevision: brick.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: brick.id,
          pose: { x: 0, y: 10, z: 0, yaw: 0 },
        },
      }),
      "FLUTUANDO",
    );
  });

  it("não entra na construção de outra cadeira", () => {
    let state = createInitialState();
    const a = pegar(state, 0, "bloco_2x4");
    state = encaixar(a.state, 0, a.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const b = pegar(state, 1, "bloco_2x2");
    const foreign = applyIntent(b.state, {
      baseRevision: b.state.revision,
      intent: {
        type: "encaixar",
        chair: 1,
        instanceId: b.id,
        pose: { x: 0, y: 4, z: 0, yaw: 0 },
      },
    });
    motivo(foreign, "CONSTRUCAO_ALHEIA");
    state = foreign.state;
    state = encaixar(state, 1, b.id, { x: 16, y: 1, z: 0, yaw: 0 });
    assert.equal(state.instances.find((p) => p.id === b.id)?.cadeira, 1);
    assert.equal(state.instances.find((p) => p.id === a.id)?.cadeira, 0);
    const crossed = state.connections.some((c) => {
      const ids = [c.a.instanceId, c.b.instanceId];
      return ids.includes(a.id) && ids.includes(b.id);
    });
    assert.equal(crossed, false);
  });

  it("dobradiça liga as folhas e não atravessa a si mesma", () => {
    let state = createInitialState();
    const leafA = pegar(state, 0, "dobradica_a");
    state = encaixar(leafA.state, 0, leafA.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const leafB = pegar(state, 0, "dobradica_b");
    state = encaixar(leafB.state, 0, leafB.id, { x: 0, y: 1, z: 0, yaw: 0 });
    assert.equal(
      state.connections.some((c) => c.a.socketId === "folha" || c.b.socketId === "folha"),
      true,
    );
    const turned = pegar(state, 0, "dobradica_b");
    motivo(
      applyIntent(turned.state, {
        baseRevision: turned.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: turned.id,
          pose: { x: 0, y: 1, z: 0, yaw: 2 },
        },
      }),
      "COLISAO",
    );
  });
});

describe("desmontagem e reuso", () => {
  it("desmonta, solta a pilha e a mesma peça volta a encaixar", () => {
    let state = createInitialState();
    const a = pegar(state, 0, "bloco_2x4");
    state = encaixar(a.state, 0, a.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const b = pegar(state, 0, "bloco_2x2");
    state = encaixar(b.state, 0, b.id, { x: 0, y: 4, z: 0, yaw: 0 });
    const other = pegar(state, 2, "bloco_1x1");
    state = encaixar(other.state, 2, other.id, { x: 32, y: 1, z: 0, yaw: 0 });

    state = must(
      applyIntent(state, {
        baseRevision: state.revision,
        intent: { type: "desmontar", chair: 0, instanceId: a.id },
      }),
    );
    assert.equal(solta(state, a.id), true);
    assert.equal(state.instances.find((p) => p.id === a.id)?.holder, 0);
    assert.equal(solta(state, b.id), true);
    assert.equal(
      state.log.some(
        (e) => e.tipo === "desmontou" && e.instanceId === a.id && e.causa === "pedido",
      ),
      true,
    );
    assert.equal(
      state.log.some(
        (e) => e.tipo === "desmontou" && e.instanceId === b.id && e.causa === "cascata",
      ),
      true,
    );
    assert.equal(state.instances.find((p) => p.id === other.id)?.pose?.x, 32);
    assert.equal(
      state.connections.some(
        (c) =>
          c.a.instanceId === a.id ||
          c.b.instanceId === a.id ||
          c.a.instanceId === b.id ||
          c.b.instanceId === b.id,
      ),
      false,
    );

    state = encaixar(state, 0, a.id, { x: 1, y: 1, z: 1, yaw: 0 });
    state = encaixar(state, 0, b.id, { x: 1, y: 4, z: 1, yaw: 0 });
    assert.equal(state.instances.find((p) => p.id === a.id)?.pose?.x, 1);
    assert.equal(state.instances.find((p) => p.id === b.id)?.cadeira, 0);
  });

  it("devolver à mesa deixa a peça disponível para outra cadeira", () => {
    let state = createInitialState();
    const a = pegar(state, 0, "bloco_1x1");
    state = must(
      applyIntent(a.state, {
        baseRevision: a.state.revision,
        intent: { type: "devolver", chair: 0, instanceId: a.id },
      }),
    );
    assert.equal(state.instances.find((p) => p.id === a.id)?.holder, "mesa");
    state = must(
      applyIntent(state, {
        baseRevision: state.revision,
        intent: { type: "pegar", chair: 1, instanceId: a.id },
      }),
    );
    assert.equal(state.instances.find((p) => p.id === a.id)?.holder, 1);
  });
});

describe("revisão", () => {
  it("duas intenções na mesma revisão não criam duas verdades", () => {
    const state = createInitialState();
    const id = state.instances.find((p) => p.defId === "roda_grande" && p.holder === "mesa")!.id;
    const first = {
      baseRevision: state.revision,
      intent: { type: "pegar" as const, chair: 0 as const, instanceId: id },
    };
    const second = {
      baseRevision: state.revision,
      intent: { type: "pegar" as const, chair: 1 as const, instanceId: id },
    };
    const race = applySerialized(state, [first, second]);
    assert.equal(race.results[0]?.ok, true);
    motivo(race.results[1]!, "REVISAO_ANTIGA");
    assert.equal(race.results[1]!.state, race.results[0]!.state);
    assert.equal(race.state.instances.find((p) => p.id === id)?.holder, 0);
    assert.equal(race.state.log.filter((e) => e.tipo === "pegou" && e.instanceId === id).length, 1);
    assert.equal(race.state.revision, 1);

    const otherWay = applySerialized(state, [second, first]);
    assert.equal(otherWay.state.instances.find((p) => p.id === id)?.holder, 1);
    assert.equal(otherWay.state.log.filter((e) => e.tipo === "pegou").length, 1);
  });

  it("uma recusa também avança a revisão e entra no histórico", () => {
    let state = createInitialState();
    const brick = pegar(state, 0, "bloco_1x2");
    const before = brick.state.revision;
    const result = applyIntent(brick.state, {
      baseRevision: before,
      intent: {
        type: "encaixar",
        chair: 0,
        instanceId: brick.id,
        pose: { x: 0, y: 8, z: 0, yaw: 0 },
      },
    });
    motivo(result, "FLUTUANDO");
    assert.equal(result.state.revision, before + 1);
    const last = result.state.log.at(-1);
    assert.equal(last?.tipo, "recusou");
    assert.equal(last?.motivo, "FLUTUANDO");
    assert.equal(last?.revision, result.state.revision);
  });

  it("a mesma recusa, nos mesmos dados, sai sempre igual", () => {
    const state = createInitialState();
    const id = state.instances.find((p) => p.defId === "bloco_2x3")!.id;
    const envelope = {
      baseRevision: state.revision,
      intent: {
        type: "encaixar" as const,
        chair: 0 as const,
        instanceId: id,
        pose: { x: 0, y: 1, z: 0, yaw: 0 as const },
      },
    };
    const left = applyIntent(structuredClone(state), envelope);
    const right = applyIntent(structuredClone(state), envelope);
    assert.deepEqual(left, right);
    motivo(left, "NAO_ESTA_NA_MAO");
  });
});

describe("toda recusa tem motivo", () => {
  it("cobre cada motivo com um código estável", () => {
    const seen = new Set<RejectReason>();
    const state = createInitialState();
    const loose = state.instances.find((p) => p.defId === "bloco_1x1" && p.holder === "mesa")!;
    const cases: ApplyResult[] = [];

    cases.push(
      applyIntent(state, {
        baseRevision: 99,
        intent: { type: "pegar", chair: 0, instanceId: loose.id },
      }),
    );
    cases.push(
      applyIntent(state, {
        baseRevision: 0,
        intent: { type: "pegar", chair: 0, instanceId: "nao-existe" },
      }),
    );
    cases.push(
      applyIntent(state, {
        baseRevision: 0,
        intent: { type: "pegar", chair: 0, instanceId: "base-0" },
      }),
    );

    let held = must(
      applyIntent(state, {
        baseRevision: 0,
        intent: { type: "pegar", chair: 0, instanceId: loose.id },
      }),
    );
    const otherId = held.instances.find((p) => p.defId === "bloco_1x1" && p.holder === "mesa")!.id;
    cases.push(
      applyIntent(held, {
        baseRevision: held.revision,
        intent: { type: "pegar", chair: 1, instanceId: loose.id },
      }),
    );
    held = encaixar(held, 0, loose.id, { x: 0, y: 1, z: 0, yaw: 0 });
    cases.push(
      applyIntent(held, {
        baseRevision: held.revision,
        intent: { type: "pegar", chair: 0, instanceId: loose.id },
      }),
    );
    cases.push(
      applyIntent(state, {
        baseRevision: 0,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: otherId,
          pose: { x: 0, y: 1, z: 0, yaw: 0 },
        },
      }),
    );
    cases.push(
      applyIntent(state, {
        baseRevision: 0,
        intent: { type: "devolver", chair: 0, instanceId: otherId },
      }),
    );
    cases.push(
      applyIntent(held, {
        baseRevision: held.revision,
        intent: { type: "desmontar", chair: 0, instanceId: otherId },
      }),
    );
    const grade = pegar(held, 0, "placa_2x2");
    cases.push(
      applyIntent(grade.state, {
        baseRevision: grade.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: grade.id,
          pose: { x: 0.5, y: 1, z: 0, yaw: 0 },
        },
      }),
    );

    const overlap = pegar(createInitialState(), 0, "bloco_2x4");
    let room = encaixar(overlap.state, 0, overlap.id, { x: 0, y: 1, z: 0, yaw: 0 });
    const second = pegar(room, 0, "bloco_2x4");
    cases.push(
      applyIntent(second.state, {
        baseRevision: second.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: second.id,
          pose: { x: 0, y: 1, z: 0, yaw: 0 },
        },
      }),
    );

    const wheel = pegar(room, 0, "roda_grande");
    cases.push(
      applyIntent(wheel.state, {
        baseRevision: wheel.state.revision,
        intent: {
          type: "encaixar",
          chair: 0,
          instanceId: wheel.id,
          pose: { x: 0, y: 6, z: 0, yaw: 0 },
        },
      }),
    );

    const foreign = pegar(room, 1, "bloco_2x2");
    cases.push(
      applyIntent(foreign.state, {
        baseRevision: foreign.state.revision,
        intent: {
          type: "encaixar",
          chair: 1,
          instanceId: foreign.id,
          pose: { x: 0, y: 4, z: 0, yaw: 0 },
        },
      }),
    );

    const air = pegar(createInitialState(), 2, "bloco_1x4");
    cases.push(
      applyIntent(air.state, {
        baseRevision: air.state.revision,
        intent: {
          type: "encaixar",
          chair: 2,
          instanceId: air.id,
          pose: { x: 32, y: 9, z: 0, yaw: 0 },
        },
      }),
    );

    for (const result of cases) {
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.ok(result.motivo.length > 0);
      assert.ok(REJECT_REASONS.includes(result.motivo));
      seen.add(result.motivo);
      const again = applyIntent(result.motivo === "REVISAO_ANTIGA" ? state : result.state, {
        baseRevision: result.motivo === "REVISAO_ANTIGA" ? 99 : result.state.revision,
        intent:
          result.motivo === "REVISAO_ANTIGA"
            ? { type: "pegar", chair: 0, instanceId: loose.id }
            : { type: "pegar", chair: 0, instanceId: "nao-existe" },
      });
      assert.equal(again.ok, false);
    }

    for (const reason of REJECT_REASONS) assert.ok(seen.has(reason), reason);
    assert.equal(room.revision > 0, true);
  });
});
