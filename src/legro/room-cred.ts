import type { Chair } from "./types.ts";

/** Credencial desta tela. Não é o documento da sala. */
export type RoomCred = {
  seatToken?: string;
  hostSecret?: string;
  requestId?: string;
  requestSecret?: string;
  chair?: Chair;
};

function key(code: string) {
  return `legro-sala:${code}`;
}

export function readCred(code: string): RoomCred {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RoomCred;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeCred(code: string, cred: RoomCred) {
  localStorage.setItem(key(code), JSON.stringify(cred));
}

export function clearCred(code: string) {
  localStorage.removeItem(key(code));
}
