import type { Chair } from "./types.ts";

/**
 * Comparar é colocar trabalhos lado a lado.
 * A ordem é a ordem em que as salas foram trazidas, e dentro da sala a ordem das cadeiras.
 * Não há tamanho, nota nem vencedor nesta ordem.
 */

export type WorkSlot = {
  code: string;
  chair: Chair;
};

const CHAIRS: readonly Chair[] = [0, 1, 2];
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function validRoomCode(value: string): boolean {
  return CODE.test(value);
}

/** Junta códigos na ordem dada. Repetido não entra de novo. Não reordena. */
export function mergeCodes(existing: readonly string[], incoming: readonly string[], limit = 6): string[] {
  const out: string[] = [];
  for (const code of [...existing, ...incoming]) {
    if (!validRoomCode(code) || out.includes(code)) continue;
    out.push(code);
    if (out.length >= limit) break;
  }
  return out;
}

/** Cada cadeira é o projeto de quem sentou. A sala que chegou primeiro continua primeiro. */
export function worksInGivenOrder(rooms: readonly { code: string }[]): WorkSlot[] {
  const out: WorkSlot[] = [];
  for (const room of rooms) {
    for (const chair of CHAIRS) out.push({ code: room.code, chair });
  }
  return out;
}
