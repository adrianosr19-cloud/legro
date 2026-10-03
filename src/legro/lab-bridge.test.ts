import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "./initial-state.ts";
import {
  bandeja,
  cornerMatchesLaw,
  devolverPeca,
  desmontarPeca,
  gridFromWorld,
  lerPrevia,
  mao,
  nextYaw,
  nudgeOnScreen,
  pegarPeca,
  PLATE,
  poseFromPoint,
  spinPiece,
  STUD,
  tentarEncaixe,
  tiltPiece,
  yawDegrees,
} from "./lab-bridge.ts";
import { CATALOG } from "./catalog.ts";
import { rotateVec, rotXZ } from "./geometry.ts";
import { applyIntent } from "./reducer.ts";
import type { ApplyResult, Pose, RoomState, Yaw } from "./types.ts";
import { evaluatePlacement } from "./validate.ts";

function must(result: ApplyResult): RoomState {
  if (!result.ok) throw new Error(result.motivo);
  return result.state;
}

function footprint(defId: string, pose: Pose): string[] {
  const seen = new Set<string>();
  for (const cell of CATALOG[defId]?.cells ?? []) {
    if (cell.kind === "vazio") continue;
    const rotated = rotXZ(cell.x, cell.z, pose.yaw);
    seen.add(`${pose.x + rotated.x},${pose.z + rotated.z}`);
  }
  return [...seen];
}

function centerOf(cells: string[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const cell of cells) {
    const [cx, cz] = cell.split(",").map(Number);
    x += cx ?? 0;
    z += cz ?? 0;
  }
  const count = cells.length || 1;
  return { x: x / count, z: z / count };
}

/** O giro só vira a planta: mesma quantidade de studs, sem esticar. */
function sameShape(before: string[], after: string[]): boolean {
  return before.length === after.length && before.length > 0;
}

function naMao(state: RoomState, defId: string): { state: RoomState; id: string } {
  const piece = state.instances.find((item) => item.defId === defId && item.holder === "mesa");
  assert.ok(piece);
  const next = must(pegarPeca(state, piece.id));
  return { state: next, id: piece.id };
}

describe("ponte do laboratório", () => {
  it("só gira nos quatro ângulos da lei", () => {
    let yaw: Yaw = 0;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(yawDegrees(yaw));
      yaw = nextYaw(yaw, 1);
    }
    assert.deepEqual(seen, [0, 90, 180, 270, 0, 90]);
    assert.equal(nextYaw(0, -1), 3);
  });

  it("a seta segue a tela, e o giro fica no miolo", () => {
    assert.deepEqual(nudgeOnScreen(0, "direita"), { x: 1, z: 0 });
    assert.deepEqual(nudgeOnScreen(0, "esquerda"), { x: -1, z: 0 });
    assert.deepEqual(nudgeOnScreen(0, "cima"), { x: 0, z: -1 });
    assert.deepEqual(nudgeOnScreen(0, "baixo"), { x: 0, z: 1 });
    assert.deepEqual(nudgeOnScreen(Math.PI / 2, "direita"), { x: 0, z: -1 });
    assert.deepEqual(nudgeOnScreen(Math.PI, "direita"), { x: -1, z: 0 });
    assert.deepEqual(nudgeOnScreen(0.55, "direita"), { x: 1, z: 0 });
    assert.deepEqual(nudgeOnScreen(0.55 + Math.PI / 2, "direita"), { x: 0, z: -1 });

    const ids = ["bloco_1x1", "bloco_1x2", "bloco_1x4", "bloco_2x2", "bloco_2x3", "bloco_2x4", "placa_4x4", "eixo_4", "roda_grande", "dobradica_a", "rampa_2x2"];
    for (const defId of ids) {
      let pose: Pose = { x: 5, y: 1, z: 5, yaw: 0 };
      const start = { ...pose };
      let prev = footprint(defId, pose);
      for (let i = 0; i < 4; i++) {
        const nextPose = spinPiece(defId, pose, "horario");
        const next = footprint(defId, nextPose);
        const hop = Math.hypot(centerOf(next).x - centerOf(prev).x, centerOf(next).z - centerOf(prev).z);
        assert.ok(hop < 0.76, `${defId} andou ${hop.toFixed(2)} studs no giro ${i}`);
        assert.ok(sameShape(prev, next), `${defId} mudou de forma no giro`);
        pose = nextPose;
        prev = next;
      }
      assert.deepEqual(pose, start, defId);
      const back = spinPiece(defId, spinPiece(defId, start, "horario"), "antihorario");
      assert.deepEqual(back, start, defId);
    }
    const brick = spinPiece("bloco_2x4", { x: 4, y: 1, z: 4, yaw: 0 }, "horario");
    assert.deepEqual(brick, { x: 6, y: 1, z: 5, yaw: 3 });
    const slim = spinPiece("bloco_1x4", { x: 2, y: 1, z: 2, yaw: 0 }, "horario");
    assert.equal(slim.yaw, 3);
    assert.deepEqual(footprint("bloco_1x4", { x: 2, y: 1, z: 2, yaw: 0 }).includes("2,3"), true);
    assert.deepEqual(footprint("bloco_1x4", slim).includes("2,3"), true);
  });

  it("virar para frente e de lado entra na mesma geometria determinística", () => {
    const start: Pose = { x: 3, y: 4, z: 5, yaw: 0 };
    const forward = tiltPiece(start, "x", 1);
    assert.equal(forward.pitch, 1);
    assert.deepEqual(rotateVec({ x: 0, y: 1, z: 0 }, forward), { x: 0, y: 0, z: 1 });

    const side = tiltPiece(start, "z", 1);
    assert.equal(side.roll, 1);
    assert.deepEqual(rotateVec({ x: 0, y: 1, z: 0 }, side), { x: -1, y: 0, z: 0 });

    let loop = start;
    for (let i = 0; i < 4; i++) loop = tiltPiece(loop, "x", 1);
    assert.equal(loop.pitch, 0);
    assert.deepEqual(rotateVec({ x: 1, y: 2, z: 3 }, loop), { x: 1, y: 2, z: 3 });
  });

  it("girar uma peça já deitada preserva a orientação e fecha o ciclo", () => {
    const start = tiltPiece({ x: 5, y: 4, z: 5, yaw: 0 }, "x", 1);
    let pose = start;
    for (let i = 0; i < 4; i++) pose = spinPiece("bloco_1x2", pose, "horario");
    assert.deepEqual(pose, start);
    assert.equal(pose.pitch, 1);
    assert.equal(pose.roll, start.roll);

    const side = tiltPiece({ x: 5, y: 4, z: 5, yaw: 0 }, "z", 1);
    const back = spinPiece(
      "bloco_2x2",
      spinPiece("bloco_2x2", side, "horario"),
      "antihorario",
    );
    assert.deepEqual(back, side);
  });

  it("a prévia 3D e o encaixe consultam exatamente a mesma lei", () => {
    let state = createInitialState();
    const brick = naMao(state, "bloco_1x2");
    state = brick.state;
    const pose = tiltPiece({ x: 1, y: 1, z: 2, yaw: 0 }, "x", 1);
    const preview = lerPrevia(state, brick.id, pose);
    const direct = evaluatePlacement(
      state,
      0,
      state.instances.find((item) => item.id === brick.id)!,
      pose,
    );
    assert.equal(preview.ok, direct.ok);
    if (!preview.ok && !direct.ok) assert.equal(preview.motivo, direct.motivo);
  });

  it("o clique vira uma pose inteira, sem encaixar sozinho", () => {
    const pose = poseFromPoint(2.1 * STUD, PLATE, 3.2 * STUD, 1);
    assert.deepEqual(pose, { x: 2, y: 1, z: 3, yaw: 1 });
    const stacked = gridFromWorld(0.4 * STUD, 4 * PLATE, 0.2 * STUD);
    assert.deepEqual(stacked, { x: 0, y: 4, z: 0 });
  });

  it("o desenho cai no mesmo stud que a lei, nos quatro giros", () => {
    const locals = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 2, z: 3 },
      { x: 0, y: -1, z: 2 },
      { x: -2, y: 0, z: 0 },
    ];
    for (const yaw of [0, 1, 2, 3] as const) {
      for (const local of locals) {
        assert.equal(cornerMatchesLaw(local, { x: 3, y: 1, z: 4, yaw }), true, `yaw ${yaw}`);
      }
    }
  });

  it("a prévia inválida é a mesma recusa do redutor, e não grava", () => {
    let state = createInitialState();
    const brick = naMao(state, "bloco_2x4");
    state = brick.state;
    const floating: Pose = { x: 0, y: 10, z: 0, yaw: 0 };
    const revision = state.revision;
    const log = state.log.length;
    const previa = lerPrevia(state, brick.id, floating);
    const committed = tentarEncaixe(state, brick.id, floating);
    const piece = state.instances.find((item) => item.id === brick.id)!;
    const direto = evaluatePlacement(state, 0, piece, floating);
    assert.equal(previa.ok, false);
    assert.equal(committed.ok, false);
    assert.equal(direto.ok, false);
    if (previa.ok || committed.ok || direto.ok) return;
    assert.equal(previa.motivo, "FLUTUANDO");
    assert.equal(committed.motivo, previa.motivo);
    assert.equal(direto.motivo, previa.motivo);
    assert.equal(state.revision, revision);
    assert.equal(state.log.length, log);
  });

  it("roda no bloco, atravessar e fora da grade repetem o motivo da lei", () => {
    let state = createInitialState();
    const brick = naMao(state, "bloco_2x4");
    state = must(tentarEncaixe(brick.state, brick.id, { x: 0, y: 1, z: 0, yaw: 0 }));
    const wheel = naMao(state, "roda_grande");
    state = wheel.state;
    const casos: Pose[] = [
      { x: 0, y: 6, z: 0, yaw: 0 },
      { x: 0, y: 1, z: 0, yaw: 0 },
      { x: 0.5, y: 1, z: 0, yaw: 0 },
    ];
    const second = naMao(state, "bloco_2x2");
    state = second.state;
    for (const pose of casos) {
      const id = pose.y === 6 ? wheel.id : second.id;
      const previa = lerPrevia(state, id, pose);
      const committed = tentarEncaixe(state, id, pose);
      const piece = state.instances.find((item) => item.id === id)!;
      const direto = evaluatePlacement(state, 0, piece, pose);
      assert.equal(previa.ok, false);
      assert.equal(committed.ok, false);
      assert.equal(direto.ok, false);
      if (previa.ok || committed.ok || direto.ok) continue;
      assert.equal(committed.motivo, direto.motivo);
      assert.equal(previa.motivo, direto.motivo);
    }
    const overlap = tentarEncaixe(state, second.id, { x: 0, y: 1, z: 0, yaw: 0 });
    assert.equal(overlap.ok, false);
    if (!overlap.ok) assert.equal(overlap.motivo, "COLISAO");
    const grade = tentarEncaixe(state, second.id, { x: 0.5, y: 1, z: 0, yaw: 0 });
    assert.equal(grade.ok, false);
    if (!grade.ok) assert.equal(grade.motivo, "FORA_DA_GRADE");
    const noStud = tentarEncaixe(state, wheel.id, { x: 0, y: 6, z: 0, yaw: 0 });
    assert.equal(noStud.ok, false);
    if (!noStud.ok) assert.equal(noStud.motivo, "ENCAIXE_INVALIDO");
  });

  it("soltar uma pose válida é o mesmo encaixe, e a peça desmontada volta", () => {
    let state = createInitialState();
    const brick = naMao(state, "bloco_1x2");
    state = brick.state;
    const pose: Pose = { x: 1, y: 1, z: 2, yaw: 2 };
    const previa = lerPrevia(state, brick.id, pose);
    assert.equal(previa.ok, true);
    const viaBotao = tentarEncaixe(state, brick.id, pose);
    const viaReducer = applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "encaixar", chair: 0, instanceId: brick.id, pose },
    });
    assert.equal(viaBotao.ok, true);
    assert.equal(viaReducer.ok, true);
    if (!viaBotao.ok || !viaReducer.ok) return;
    assert.deepEqual(
      viaBotao.state.instances.find((item) => item.id === brick.id)?.pose,
      viaReducer.state.instances.find((item) => item.id === brick.id)?.pose,
    );
    state = viaBotao.state;
    const solta = desmontarPeca(state, brick.id);
    const direto = applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "desmontar", chair: 0, instanceId: brick.id },
    });
    assert.equal(solta.ok && direto.ok, true);
    if (!solta.ok || !direto.ok) return;
    assert.equal(solta.state.instances.find((item) => item.id === brick.id)?.pose, null);
    assert.deepEqual(
      solta.state.instances.find((item) => item.id === brick.id),
      direto.state.instances.find((item) => item.id === brick.id),
    );
    const deNovo = tentarEncaixe(solta.state, brick.id, { x: 2, y: 1, z: 2, yaw: 0 });
    assert.equal(deNovo.ok, true);
  });

  it("sem estar na mão, a prévia recusa mesmo que a geometria sirva", () => {
    const state = createInitialState();
    const piece = state.instances.find((item) => item.defId === "bloco_2x2" && item.holder === "mesa")!;
    const pose: Pose = { x: 0, y: 1, z: 0, yaw: 0 };
    const geometria = evaluatePlacement(state, 0, piece, pose);
    const previa = lerPrevia(state, piece.id, pose);
    assert.equal(geometria.ok, true);
    assert.equal(previa.ok, false);
    if (!previa.ok) assert.equal(previa.motivo, "NAO_ESTA_NA_MAO");
    const devolve = devolverPeca(state, piece.id);
    assert.equal(devolve.ok, false);
    if (!devolve.ok) assert.equal(devolve.motivo, "NAO_ESTA_NA_MESA");
  });

  it("a bandeja só mostra a mesa, e a mão só a cadeira zero", () => {
    let state = createInitialState();
    const antes = bandeja(state).reduce((sum, item) => sum + item.count, 0);
    assert.equal(mao(state).length, 0);
    const brick = naMao(state, "bloco_2x4");
    state = brick.state;
    assert.equal(bandeja(state).reduce((sum, item) => sum + item.count, 0), antes - 1);
    assert.deepEqual(mao(state).map((item) => item.id), [brick.id]);
    state = must(tentarEncaixe(state, brick.id, { x: 0, y: 1, z: 0, yaw: 0 }));
    assert.equal(mao(state).length, 0);
    assert.equal(
      state.instances.some((item) => item.cadeira === 1 && item.holder !== "fixa"),
      false,
    );
  });
});
