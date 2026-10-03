import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aabbOverlaps, cellAabbU, PLATE_U, STUD_U } from "./spatial.ts";

describe("geometria física inteira", () => {
  it("preserva a proporção stud/placa quando a célula fica deitada", () => {
    const cell = { x: 0, y: 0, z: 0, kind: "solido" as const };
    const upright = cellAabbU(cell, { x: 0, y: 0, z: 0, yaw: 0 });
    assert.deepEqual(upright, { min: { x: 0, y: 0, z: 0 }, max: { x: STUD_U, y: PLATE_U, z: STUD_U } });

    const laid = cellAabbU(cell, { x: 0, y: 0, z: 0, yaw: 0, pitch: 1 });
    assert.equal(laid.max.x - laid.min.x, STUD_U);
    assert.equal(laid.max.y - laid.min.y, STUD_U);
    assert.equal(laid.max.z - laid.min.z, PLATE_U);
  });

  it("encostar faces não vira colisão", () => {
    const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 2, z: 5 } };
    const b = { min: { x: 5, y: 0, z: 0 }, max: { x: 10, y: 2, z: 5 } };
    assert.equal(aabbOverlaps(a, b), false);
  });

  it("uma volta ortogonal não cria medidas fracionárias", () => {
    const cell = { x: 1, y: 2, z: 3, kind: "solido" as const };
    for (const pitch of [0, 1, 2, 3] as const) {
      for (const yaw of [0, 1, 2, 3] as const) {
        for (const roll of [0, 1, 2, 3] as const) {
          const box = cellAabbU(cell, { x: 2, y: 3, z: 4, yaw, pitch, roll });
          for (const n of [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]) assert.equal(Number.isInteger(n), true);
        }
      }
    }
  });
});
