import { CATALOG } from "./catalog.ts";
import type { LoanFact } from "./loan.ts";
import { MOTIVO_TEXTO, type Chair, type GameEvent } from "./types.ts";

/** Textos da sala. A lei continua com os motivos dela; aqui só entra o que a sala recusa. */
export const SALA_TEXTO: Record<string, string> = {
  ...MOTIVO_TEXTO,
  SALA_DESCONHECIDA: "Não existe sala com esse código.",
  CADEIRA_OCUPADA: "Essa cadeira já tem alguém.",
  CADEIRA_INVALIDA: "Essa cadeira não é a sua.",
  CADEIRA_FORA: "Escolha a cadeira 1, 2 ou 3.",
  PEDIDO_DESCONHECIDO: "Esse pedido não está mais na sala.",
  PEDIDO_PENDENTE: "Essa cadeira já tem um pedido esperando.",
  NAO_E_ANFITRIAO: "Só o anfitrião pode fazer isso.",
  FORA_DE_FASE: "A sala não está em construção.",
  JA_COMECOU: "A rodada já começou.",
  SALA_CHEIA: "A sala não aceita outro pedido agora.",
  POSSE_PROPRIA: "Essa peça já está com você.",
  PECA_NA_MESA: "Essa peça está na mesa. Não é empréstimo.",
  PECA_MONTADA: "Essa peça está montada. Empréstimo só sai da mão.",
  EMPRESTIMO_PENDENTE: "Essa peça já tem um pedido esperando resposta.",
  EMPRESTIMO_DESCONHECIDO: "Esse pedido de peça não está na sala.",
  NAO_E_O_DONO: "Só quem está com a peça pode aceitar ou recusar.",
  PECA_INDISPONIVEL: "A peça não está mais na mão de quem a tinha.",
  POSSE_MUDOU: "A peça mudou de posse. O pedido não vale.",
  SEM_EMPRESTIMO: "Essa peça não está emprestada a você.",
  JA_RESPONDIDO: "Esse pedido já foi respondido.",
};

export const CADEIRA_NOME = ["Cadeira 1", "Cadeira 2", "Cadeira 3"] as const;

/** O fato, em português. Sem adjetivo sobre a criança. */
export function textoDoFato(fact: LoanFact): string {
  const peca = CATALOG[fact.defId]?.nome ?? fact.defId;
  const nome = `${peca} ${fact.cor} (${fact.pieceId})`;
  const pediu = CADEIRA_NOME[fact.pedidoPor];
  const tinha = CADEIRA_NOME[fact.posseDe];
  switch (fact.type) {
    case "EMPRESTIMO_SOLICITADO":
      return `${pediu} pediu ${nome}, que estava com ${tinha}.`;
    case "EMPRESTIMO_ACEITO":
      return `${tinha} aceitou. ${fact.pieceId} passou de ${tinha} para ${pediu}.`;
    case "EMPRESTIMO_RECUSADO":
      return `${tinha} recusou. ${fact.pieceId} continua com ${tinha}.`;
    case "EMPRESTIMO_DEVOLVIDO":
      return `${pediu} devolveu ${fact.pieceId} a ${tinha}.`;
    case "EMPRESTIMO_DEVOLVIDO_A_MESA":
      return `${pediu} devolveu ${fact.pieceId} à mesa.`;
    case "EMPRESTIMO_INDISPONIVEL":
      return `${fact.pieceId} saiu da mão de ${tinha} antes da resposta. O pedido encerrou.`;
    case "EMPRESTIMO_SEM_RESPOSTA":
      return `O tempo acabou. O pedido de ${pediu} sobre ${fact.pieceId}, que estava com ${tinha}, encerrou sem resposta. A posse não mudou.`;
  }
}

/** Linha da lei, em português. Diz o que ocorreu, não se foi bom. */
export function textoDaLei(event: {
  cadeira: Chair;
  tipo: GameEvent["tipo"];
  instanceId: string;
  causa?: GameEvent["causa"] | null;
  motivo?: GameEvent["motivo"] | null;
  pose?: { x: number; y: number; z: number } | null;
}): string {
  const quem = CADEIRA_NOME[event.cadeira];
  const id = event.instanceId;
  switch (event.tipo) {
    case "pegou":
      return `${quem} pegou ${id}.`;
    case "devolveu":
      return `${quem} devolveu ${id} à mesa.`;
    case "encaixou": {
      const onde = event.pose ? ` em x ${event.pose.x}, y ${event.pose.y}, z ${event.pose.z}` : "";
      return `${quem} encaixou ${id}${onde}.`;
    }
    case "desmontou":
      return event.causa === "cascata"
        ? `${id} saiu junto da construção de ${quem}.`
        : `${quem} desmontou ${id}.`;
    case "recusou":
      return `${quem} não moveu ${id}. ${event.motivo ? MOTIVO_TEXTO[event.motivo] : "A lei recusou."}`;
  }
}
