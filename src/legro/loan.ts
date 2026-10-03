import { CATALOG } from "./catalog.ts";
import type { Chair, Holder, RoomState } from "./types.ts";

/**
 * Empréstimo é um fato de posse. Não é encaixe e não é nota.
 *
 * A instância não é copiada: o mesmo id, a mesma cor e a mesma definição.
 * Só muda o holder, e só quando a peça está na mão (pose nula).
 *
 * Pedir: a peça precisa estar na mão de outra cadeira, a cadeira que a tela viu.
 * Se a posse já não é essa, o pedido não nasce.
 * Peça na mesa, montada, fixa ou na própria mão: recusa, sem escrever posse.
 * Uma instância só tem um pedido pendente.
 *
 * Aceitar: a mesma instância passa para a mão de quem pediu.
 * Recusar: a posse fica como está.
 * Se na hora da resposta a peça está montada, o pedido continua.
 * A desmontagem devolve essa mesma instância à mão; não abre outra peça.
 * Se a peça saiu da mão (mesa ou outra cadeira) antes da resposta,
 * o pedido encerra como indisponível e a posse não muda por causa dele.
 *
 * Devolução ao dono: operação explícita. Da mão de quem recebeu
 * para a mão de quem emprestou neste empréstimo. O id não muda.
 * Devolver à mesa continua sendo a ação da lei. Se havia empréstimo aberto,
 * ele encerra e a peça volta à bandeja, ainda com o mesmo id.
 * Peça montada não se devolve: primeiro desmonta.
 *
 * Nenhum fato diz se alguém foi bom, generoso ou egoísta.
 */

export const LOAN_FACT_TYPES = [
  "EMPRESTIMO_SOLICITADO",
  "EMPRESTIMO_ACEITO",
  "EMPRESTIMO_RECUSADO",
  "EMPRESTIMO_DEVOLVIDO",
  "EMPRESTIMO_DEVOLVIDO_A_MESA",
  "EMPRESTIMO_INDISPONIVEL",
  "EMPRESTIMO_SEM_RESPOSTA",
] as const;

export type LoanFactType = (typeof LOAN_FACT_TYPES)[number];

export const LOAN_REASONS = [
  "PECA_DESCONHECIDA",
  "BASE_FIXA",
  "POSSE_PROPRIA",
  "PECA_NA_MESA",
  "PECA_MONTADA",
  "EMPRESTIMO_PENDENTE",
  "EMPRESTIMO_DESCONHECIDO",
  "NAO_E_O_DONO",
  "PECA_INDISPONIVEL",
  "POSSE_MUDOU",
  "SEM_EMPRESTIMO",
  "JA_RESPONDIDO",
  "NAO_ESTA_NA_MAO",
] as const;

export type LoanReason = (typeof LOAN_REASONS)[number];

export type LoanStatus =
  | "pendente"
  | "aceito"
  | "recusado"
  | "devolvido"
  | "devolvido_a_mesa"
  | "indisponivel"
  | "repassado"
  | "sem_resposta";

export type LoanRecord = {
  id: string;
  pieceId: string;
  defId: string;
  cor: string;
  from: Chair;
  to: Chair;
  status: LoanStatus;
  requestedAt: number;
  requestedRoomRevision: number;
  decidedAt: number | null;
  decidedRoomRevision: number | null;
  closedAt: number | null;
  closedRoomRevision: number | null;
};

/** Um fato. A revisão da sala é a que este resultado gravou. */
export type LoanFact = {
  loanId: string;
  type: LoanFactType;
  at: number;
  roomRevision: number;
  lawRevision: number;
  pieceId: string;
  defId: string;
  cor: string;
  pedidoPor: Chair;
  posseDe: Chair;
  decididoPor: Chair | null;
};

export type LoanMutation = {
  ok: boolean;
  motivo: LoanReason | null;
  write: boolean;
  law: RoomState;
  loans: LoanRecord[];
  history: LoanFact[];
};

function isChair(value: Holder | null | undefined): value is Chair {
  return value === 0 || value === 1 || value === 2;
}

function findPiece(state: RoomState, id: string) {
  return state.instances.find((piece) => piece.id === id);
}

function keep(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  motivo: LoanReason,
): LoanMutation {
  return { ok: false, motivo, write: false, law, loans, history };
}

function cloneLoans(loans: LoanRecord[]): LoanRecord[] {
  return loans.map((loan) => ({ ...loan }));
}

function factOf(
  loan: LoanRecord,
  type: LoanFactType,
  at: number,
  roomRevision: number,
  lawRevision: number,
  decididoPor: Chair | null,
): LoanFact {
  return {
    loanId: loan.id,
    type,
    at,
    roomRevision,
    lawRevision,
    pieceId: loan.pieceId,
    defId: loan.defId,
    cor: loan.cor,
    pedidoPor: loan.to,
    posseDe: loan.from,
    decididoPor,
  };
}

/** Muda a mão. Não cria instância e não mexe no histórico da lei. */
function moveHold(state: RoomState, pieceId: string, holder: Chair): RoomState {
  return {
    revision: state.revision + 1,
    instances: state.instances.map((piece) => {
      const pose = piece.pose ? { ...piece.pose } : null;
      if (piece.id !== pieceId) return { ...piece, pose };
      return { ...piece, holder, pose: null, cadeira: null };
    }),
    connections: state.connections.map((link) => ({
      a: { ...link.a },
      b: { ...link.b },
    })),
    log: state.log.slice(),
  };
}

function unavailableReason(holder: Holder): LoanReason {
  if (holder === "mesa") return "PECA_NA_MESA";
  if (holder === "fixa") return "BASE_FIXA";
  return "POSSE_MUDOU";
}

export function askPiece(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  chair: Chair,
  pieceId: string,
  expectedHolder: Chair,
  now: number,
  nextRoomRevision: number,
  loanId: string,
): LoanMutation {
  const piece = findPiece(law, pieceId);
  if (!piece) return keep(law, loans, history, "PECA_DESCONHECIDA");
  const def = CATALOG[piece.defId];
  if (!def || def.fixa || piece.holder === "fixa") return keep(law, loans, history, "BASE_FIXA");
  if (piece.holder === chair) return keep(law, loans, history, "POSSE_PROPRIA");
  if (piece.holder === "mesa") return keep(law, loans, history, "PECA_NA_MESA");
  if (!isChair(piece.holder)) return keep(law, loans, history, "PECA_INDISPONIVEL");
  if (piece.holder !== expectedHolder) return keep(law, loans, history, "POSSE_MUDOU");
  if (piece.pose) return keep(law, loans, history, "PECA_MONTADA");
  if (loans.some((loan) => loan.pieceId === pieceId && loan.status === "pendente")) {
    return keep(law, loans, history, "EMPRESTIMO_PENDENTE");
  }

  const loan: LoanRecord = {
    id: loanId,
    pieceId: piece.id,
    defId: piece.defId,
    cor: piece.cor,
    from: piece.holder,
    to: chair,
    status: "pendente",
    requestedAt: now,
    requestedRoomRevision: nextRoomRevision,
    decidedAt: null,
    decidedRoomRevision: null,
    closedAt: null,
    closedRoomRevision: null,
  };
  return {
    ok: true,
    motivo: null,
    write: true,
    law,
    loans: [...cloneLoans(loans), loan],
    history: [...history, factOf(loan, "EMPRESTIMO_SOLICITADO", now, nextRoomRevision, law.revision, null)],
  };
}

export function answerPiece(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  chair: Chair,
  loanId: string,
  accept: boolean,
  now: number,
  nextRoomRevision: number,
): LoanMutation {
  const loan = loans.find((item) => item.id === loanId);
  if (!loan) return keep(law, loans, history, "EMPRESTIMO_DESCONHECIDO");
  if (loan.status !== "pendente") return keep(law, loans, history, "JA_RESPONDIDO");
  if (loan.from !== chair) return keep(law, loans, history, "NAO_E_O_DONO");

  if (!accept) {
    const nextLoans = cloneLoans(loans).map((item) =>
      item.id === loan.id
        ? { ...item, status: "recusado" as const, decidedAt: now, decidedRoomRevision: nextRoomRevision }
        : item,
    );
    const decided = nextLoans.find((item) => item.id === loan.id)!;
    return {
      ok: true,
      motivo: null,
      write: true,
      law,
      loans: nextLoans,
      history: [...history, factOf(decided, "EMPRESTIMO_RECUSADO", now, nextRoomRevision, law.revision, chair)],
    };
  }

  const piece = findPiece(law, loan.pieceId);
  if (!piece) {
    return closeUnavailable(law, loans, history, loan.id, "PECA_DESCONHECIDA", now, nextRoomRevision, chair);
  }
  if (piece.pose) return keep(law, loans, history, "PECA_MONTADA");
  if (piece.holder !== loan.from) {
    return closeUnavailable(
      law,
      loans,
      history,
      loan.id,
      unavailableReason(piece.holder),
      now,
      nextRoomRevision,
      chair,
    );
  }

  const moved = moveHold(law, piece.id, loan.to);
  const nextLoans = cloneLoans(loans).map((item) => {
    if (item.id === loan.id) {
      return { ...item, status: "aceito" as const, decidedAt: now, decidedRoomRevision: nextRoomRevision };
    }
    if (item.pieceId === loan.pieceId && item.status === "aceito") {
      return {
        ...item,
        status: "repassado" as const,
        closedAt: now,
        closedRoomRevision: nextRoomRevision,
      };
    }
    return item;
  });
  const decided = nextLoans.find((item) => item.id === loan.id)!;
  return {
    ok: true,
    motivo: null,
    write: true,
    law: moved,
    loans: nextLoans,
    history: [...history, factOf(decided, "EMPRESTIMO_ACEITO", now, nextRoomRevision, moved.revision, chair)],
  };
}

function closeUnavailable(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  loanId: string,
  motivo: LoanReason,
  now: number,
  nextRoomRevision: number,
  chair: Chair,
): LoanMutation {
  const nextLoans = cloneLoans(loans).map((item) =>
    item.id === loanId
      ? {
          ...item,
          status: "indisponivel" as const,
          decidedAt: now,
          decidedRoomRevision: nextRoomRevision,
          closedAt: now,
          closedRoomRevision: nextRoomRevision,
        }
      : item,
  );
  const decided = nextLoans.find((item) => item.id === loanId)!;
  return {
    ok: false,
    motivo,
    write: true,
    law,
    loans: nextLoans,
    history: [
      ...history,
      factOf(decided, "EMPRESTIMO_INDISPONIVEL", now, nextRoomRevision, law.revision, chair),
    ],
  };
}

export function returnPiece(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  chair: Chair,
  pieceId: string,
  now: number,
  nextRoomRevision: number,
): LoanMutation {
  const loan = loans.find((item) => item.status === "aceito" && item.pieceId === pieceId && item.to === chair);
  if (!loan) return keep(law, loans, history, "SEM_EMPRESTIMO");
  const piece = findPiece(law, pieceId);
  if (!piece) return keep(law, loans, history, "PECA_DESCONHECIDA");
  if (piece.pose) return keep(law, loans, history, "PECA_MONTADA");
  if (piece.holder !== chair) return keep(law, loans, history, "NAO_ESTA_NA_MAO");

  const moved = moveHold(law, piece.id, loan.from);
  const nextLoans = cloneLoans(loans).map((item) =>
    item.id === loan.id
      ? {
          ...item,
          status: "devolvido" as const,
          closedAt: now,
          closedRoomRevision: nextRoomRevision,
        }
      : item,
  );
  const decided = nextLoans.find((item) => item.id === loan.id)!;
  return {
    ok: true,
    motivo: null,
    write: true,
    law: moved,
    loans: nextLoans,
    history: [
      ...history,
      factOf(decided, "EMPRESTIMO_DEVOLVIDO", now, nextRoomRevision, moved.revision, chair),
    ],
  };
}

/**
 * Depois de uma ação da lei que deu certo.
 * Devolver à mesa encerra o empréstimo aberto.
 * Se a peça saiu da mão de quem tinha o pedido pendente, o pedido encerra
 * sem mudar a posse por causa do pedido.
 * Montar ou desmontar não copia a peça e não apaga o pedido.
 */
export function settleAfterLaw(
  law: RoomState,
  loans: LoanRecord[],
  history: LoanFact[],
  now: number,
  nextRoomRevision: number,
): { loans: LoanRecord[]; history: LoanFact[]; changed: boolean } {
  let changed = false;
  const nextLoans = cloneLoans(loans);
  const extra: LoanFact[] = [];
  for (const loan of nextLoans) {
    const piece = findPiece(law, loan.pieceId);
    if (loan.status === "aceito" && (!piece || piece.holder === "mesa")) {
      loan.status = "devolvido_a_mesa";
      loan.closedAt = now;
      loan.closedRoomRevision = nextRoomRevision;
      extra.push(factOf(loan, "EMPRESTIMO_DEVOLVIDO_A_MESA", now, nextRoomRevision, law.revision, loan.to));
      changed = true;
      continue;
    }
    if (loan.status === "pendente" && (!piece || piece.holder !== loan.from)) {
      loan.status = "indisponivel";
      loan.closedAt = now;
      loan.closedRoomRevision = nextRoomRevision;
      extra.push(factOf(loan, "EMPRESTIMO_INDISPONIVEL", now, nextRoomRevision, law.revision, null));
      changed = true;
    }
  }
  if (!changed) return { loans, history, changed: false };
  return { loans: nextLoans, history: [...history, ...extra], changed: true };
}
