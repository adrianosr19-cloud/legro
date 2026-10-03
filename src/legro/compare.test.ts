import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeCodes, worksInGivenOrder } from "./compare.ts";

describe("comparar salas", () => {
  it("não reordena pelo código nem repete", () => {
    const codes = mergeCodes(["ZZZZZZZ2", "AAAAAAA2"], ["MMMMMMM2", "ZZZZZZZ2", "BBBBBBB2"]);
    assert.deepEqual(codes, ["ZZZZZZZ2", "AAAAAAA2", "MMMMMMM2", "BBBBBBB2"]);
  });

  it("os trabalhos seguem a sala que chegou e a cadeira, não um tamanho", () => {
    const slots = worksInGivenOrder([{ code: "SALA2222" }, { code: "SALA3333" }]);
    assert.deepEqual(
      slots.map((slot) => `${slot.code}:${slot.chair}`),
      ["SALA2222:0", "SALA2222:1", "SALA2222:2", "SALA3333:0", "SALA3333:1", "SALA3333:2"],
    );
    const text = JSON.stringify(slots);
    for (const word of ["vencedor", "ranking", "nota", "melhor", "pontos"]) {
      assert.equal(text.includes(word), false);
    }
  });
});
