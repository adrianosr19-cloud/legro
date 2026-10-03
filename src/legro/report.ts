import { CATALOG, baseId } from "./catalog.ts";
import type { LoanFact, LoanRecord } from "./loan.ts";
import type { Chair, Family, GameEvent, Pose, RoomState } from "./types.ts";

/**
 * Retrato da partida no instante em que a sala entra em exposição.
 * Só números e listas que já estão no estado ou no histórico.
 * Não há nota, vencedor, beleza, criatividade nem empatia.
 *
 * Profundidade: quantos encaixes separam a peça da base daquela cadeira.
 * A base é 0. Uma peça presa direto nela é 1.
 * Peça reutilizada: a mesma instância foi encaixada duas vezes ou mais por aquela cadeira.
 * Desmontagem: só o pedido da criança, não a cascata.
 * Empréstimo realizado: aceite em que a cadeira era quem tinha a peça.
 * Empréstimo recebido: aceite em que a cadeira era quem pediu.
 * Pedido recusado: pedido feito por essa cadeira e recusado. Não é um juízo.
 * Devolvida à mesa: evento da lei "devolveu".
 * Devolvida ao dono: fato EMPRESTIMO_DEVOLVIDO decidido por essa cadeira.
 * Evento relevante: cada linha da lei dessa cadeira, mais cada fato de empréstimo
 * em que ela pediu, tinha a peça ou decidiu.
 */

export type ReportPiece = {
  id: string;
  defId: string;
  familias: Family[];
  cor: string;
  pose: Pose;
  /** Encaixes até a base. Null se a peça não alcança a base por ligação. */
  profundidade: number | null;
};

export type ReportLink = {
  a: { instanceId: string; socketId: string };
  b: { instanceId: string; socketId: string };
};

export type ReportLawEvent = {
  revision: number;
  cadeira: Chair;
  tipo: GameEvent["tipo"];
  instanceId: string;
  causa: GameEvent["causa"] | null;
  motivo: GameEvent["motivo"] | null;
  pose: Pose | null;
  encaixes: number | null;
};

/** Onde cada instância estava no instante do encerramento. Sem juízo. */
export type ClosedPiece = {
  id: string;
  defId: string;
  cor: string;
  holder: "mesa" | "fixa" | Chair;
  cadeira: Chair | null;
  pose: Pose | null;
};

export type ReportLoanEvent = {
  loanId: string;
  type: LoanFact["type"];
  at: number;
  roomRevision: number;
  pieceId: string;
  pedidoPor: Chair;
  posseDe: Chair;
  decididoPor: Chair | null;
};

export type ChairReport = {
  chair: Chair;
  pecasNaConstrucao: number;
  tiposDiferentes: number;
  familias: Family[];
  conexoes: number;
  profundidadeMaxima: number;
  pecasReutilizadas: number;
  desmontagens: number;
  emprestimosRealizados: number;
  emprestimosRecebidos: number;
  pedidosRealizados: number;
  pedidosRecusados: number;
  pecasDevolvidasAMesa: number;
  pecasDevolvidasAoDono: number;
  pecasNaMao: number;
  eventosRelevantes: number;
  pecas: ReportPiece[];
  ligacoes: ReportLink[];
};

export type MatchReport = {
  roomRevision: number;
  lawRevision: number;
  startedAt: number;
  closedAt: number;
  durationMs: number;
  cadeiras: ChairReport[];
  pedidosEncerradosSemResposta: string[];
  /** Todas as instâncias, inclusive mesa, mão e base. A construção não precisa ser relida. */
  pecasNoEncerramento: ClosedPiece[];
  conexoesNoEncerramento: ReportLink[];
  historicoLei: ReportLawEvent[];
  historicoEmprestimos: ReportLoanEvent[];
};

const CHAIRS: readonly Chair[] = [0, 1, 2];

function familiasOf(defId: string): Family[] {
  const def = CATALOG[defId];
  if (!def) return [];
  const found = new Set<Family>();
  for (const socket of def.sockets) found.add(socket.family);
  return [...found].sort();
}

function touches(chair: Chair, fact: LoanFact): boolean {
  return fact.pedidoPor === chair || fact.posseDe === chair || fact.decididoPor === chair;
}

function depthsOf(base: string, links: ReportLink[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = adj.get(from);
    if (list) list.push(to);
    else adj.set(from, [to]);
  };
  for (const link of links) {
    add(link.a.instanceId, link.b.instanceId);
    add(link.b.instanceId, link.a.instanceId);
  }
  const depth = new Map<string, number>([[base, 0]]);
  const queue = [base];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of adj.get(id) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, (depth.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }
  return depth;
}

function maxDepth(depth: Map<string, number>, placed: Set<string>): number {
  let max = 0;
  for (const id of placed) {
    const found = depth.get(id);
    if (found != null && found > max) max = found;
  }
  return max;
}

function chairReport(chair: Chair, law: RoomState, history: LoanFact[]): ChairReport {
  const placed = law.instances
    .filter((piece) => piece.cadeira === chair && piece.pose && !CATALOG[piece.defId]?.fixa)
    .sort((a, b) => a.id.localeCompare(b.id));
  const placedIds = new Set(placed.map((piece) => piece.id));
  const mine = new Set<string>([baseId(chair), ...placedIds]);
  const ligacoes = law.connections
    .filter((link) => mine.has(link.a.instanceId) && mine.has(link.b.instanceId))
    .map((link) => ({
      a: { instanceId: link.a.instanceId, socketId: link.a.socketId },
      b: { instanceId: link.b.instanceId, socketId: link.b.socketId },
    }))
    .sort((a, b) => `${a.a.instanceId}:${a.a.socketId}`.localeCompare(`${b.a.instanceId}:${b.a.socketId}`));
  const depth = depthsOf(baseId(chair), ligacoes);
  const familias = [...new Set(placed.flatMap((piece) => familiasOf(piece.defId)))].sort();
  const mounts = new Map<string, number>();
  let desmontagens = 0;
  let pecasDevolvidasAMesa = 0;
  let eventosLei = 0;
  for (const event of law.log) {
    if (event.cadeira !== chair) continue;
    eventosLei += 1;
    if (event.tipo === "encaixou") mounts.set(event.instanceId, (mounts.get(event.instanceId) ?? 0) + 1);
    if (event.tipo === "desmontou" && event.causa === "pedido") desmontagens += 1;
    if (event.tipo === "devolveu") pecasDevolvidasAMesa += 1;
  }
  let emprestimosRealizados = 0;
  let emprestimosRecebidos = 0;
  let pedidosRealizados = 0;
  let pedidosRecusados = 0;
  let pecasDevolvidasAoDono = 0;
  let eventosEmprestimo = 0;
  for (const fact of history) {
    if (!touches(chair, fact)) continue;
    eventosEmprestimo += 1;
    if (fact.type === "EMPRESTIMO_ACEITO" && fact.posseDe === chair) emprestimosRealizados += 1;
    if (fact.type === "EMPRESTIMO_ACEITO" && fact.pedidoPor === chair) emprestimosRecebidos += 1;
    if (fact.type === "EMPRESTIMO_SOLICITADO" && fact.pedidoPor === chair) pedidosRealizados += 1;
    if (fact.type === "EMPRESTIMO_RECUSADO" && fact.pedidoPor === chair) pedidosRecusados += 1;
    if (fact.type === "EMPRESTIMO_DEVOLVIDO" && fact.decididoPor === chair) pecasDevolvidasAoDono += 1;
  }
  return {
    chair,
    pecasNaConstrucao: placed.length,
    tiposDiferentes: new Set(placed.map((piece) => piece.defId)).size,
    familias,
    conexoes: ligacoes.length,
    profundidadeMaxima: maxDepth(depth, placedIds),
    pecasReutilizadas: [...mounts.values()].filter((count) => count >= 2).length,
    desmontagens,
    emprestimosRealizados,
    emprestimosRecebidos,
    pedidosRealizados,
    pedidosRecusados,
    pecasDevolvidasAMesa,
    pecasDevolvidasAoDono,
    pecasNaMao: law.instances.filter(
      (piece) => piece.holder === chair && piece.pose === null && !CATALOG[piece.defId]?.fixa,
    ).length,
    eventosRelevantes: eventosLei + eventosEmprestimo,
    pecas: placed.map((piece) => ({
      id: piece.id,
      defId: piece.defId,
      familias: familiasOf(piece.defId),
      cor: piece.cor,
      pose: { ...piece.pose! },
      profundidade: depth.get(piece.id) ?? null,
    })),
    ligacoes,
  };
}

export function buildReport(input: {
  law: RoomState;
  history: LoanFact[];
  roomRevision: number;
  startedAt: number;
  closedAt: number;
  durationMs: number;
  closedLoanIds: string[];
}): MatchReport {
  return {
    roomRevision: input.roomRevision,
    lawRevision: input.law.revision,
    startedAt: input.startedAt,
    closedAt: input.closedAt,
    durationMs: input.durationMs,
    cadeiras: CHAIRS.map((chair) => chairReport(chair, input.law, input.history)),
    pedidosEncerradosSemResposta: [...input.closedLoanIds].sort(),
    pecasNoEncerramento: input.law.instances
      .map((piece) => ({
        id: piece.id,
        defId: piece.defId,
        cor: piece.cor,
        holder: piece.holder,
        cadeira: piece.cadeira,
        pose: piece.pose ? { ...piece.pose } : null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    conexoesNoEncerramento: input.law.connections
      .map((link) => ({
        a: { instanceId: link.a.instanceId, socketId: link.a.socketId },
        b: { instanceId: link.b.instanceId, socketId: link.b.socketId },
      }))
      .sort((a, b) =>
        `${a.a.instanceId}:${a.a.socketId}:${a.b.instanceId}:${a.b.socketId}`.localeCompare(
          `${b.a.instanceId}:${b.a.socketId}:${b.b.instanceId}:${b.b.socketId}`,
        ),
      ),
    historicoLei: input.law.log.map((event) => ({
      revision: event.revision,
      cadeira: event.cadeira,
      tipo: event.tipo,
      instanceId: event.instanceId,
      causa: event.causa ?? null,
      motivo: event.motivo ?? null,
      pose: event.pose ? { ...event.pose } : null,
      encaixes: event.encaixes ?? null,
    })),
    historicoEmprestimos: input.history.map((fact) => ({
      loanId: fact.loanId,
      type: fact.type,
      at: fact.at,
      roomRevision: fact.roomRevision,
      pieceId: fact.pieceId,
      pedidoPor: fact.pedidoPor,
      posseDe: fact.posseDe,
      decididoPor: fact.decididoPor,
    })),
  };
}

/** O relógio encerra pedido pendente. Não move peça e não copia instância. */
export function closePendingForExhibition(
  loans: LoanRecord[],
  history: LoanFact[],
  now: number,
  nextRoomRevision: number,
  lawRevision: number,
): { loans: LoanRecord[]; history: LoanFact[]; closedIds: string[] } {
  const closedIds: string[] = [];
  const extra: LoanFact[] = [];
  const next = loans.map((loan) => ({ ...loan }));
  for (const loan of next) {
    if (loan.status !== "pendente") continue;
    loan.status = "sem_resposta";
    loan.decidedAt = now;
    loan.decidedRoomRevision = nextRoomRevision;
    loan.closedAt = now;
    loan.closedRoomRevision = nextRoomRevision;
    closedIds.push(loan.id);
    extra.push({
      loanId: loan.id,
      type: "EMPRESTIMO_SEM_RESPOSTA",
      at: now,
      roomRevision: nextRoomRevision,
      lawRevision,
      pieceId: loan.pieceId,
      defId: loan.defId,
      cor: loan.cor,
      pedidoPor: loan.to,
      posseDe: loan.from,
      decididoPor: null,
    });
  }
  if (closedIds.length === 0) return { loans, history, closedIds };
  closedIds.sort();
  return { loans: next, history: [...history, ...extra], closedIds };
}
