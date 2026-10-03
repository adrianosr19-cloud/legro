/** Lei do LEGRO. Sem render, sem rede, sem IA. */

export type QuarterTurn = 0 | 1 | 2 | 3;
export type Yaw = QuarterTurn;
export type Chair = 0 | 1 | 2;
export type Normal = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export type Axis = "x" | "z" | "y";
export type Family = "bloco" | "eixo" | "dobradica";
export type Gender = "pino" | "cavidade" | "eixo" | "furo" | "cubo" | "folhaA" | "folhaB";
export type CellKind = "solido" | "vazio" | "tunel";

export type CellDef = {
  x: number;
  y: number;
  z: number;
  kind: CellKind;
};

export type SocketDef = {
  id: string;
  x: number;
  y: number;
  z: number;
  family: Family;
  gender: Gender;
  normal?: Normal;
  axis?: Axis;
};

export type PieceDef = {
  id: string;
  nome: string;
  fixa: boolean;
  cells: CellDef[];
  sockets: SocketDef[];
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  yaw: Yaw;
  /** Quartos de volta em torno de X. Ausente equivale a 0 para salas antigas. */
  pitch?: QuarterTurn;
  /** Quartos de volta em torno de Z. Ausente equivale a 0 para salas antigas. */
  roll?: QuarterTurn;
};

export type Holder = "mesa" | Chair | "fixa";

export type PieceInstance = {
  id: string;
  defId: string;
  cor: string;
  holder: Holder;
  pose: Pose | null;
  /** Dono da construção. Null enquanto a peça está solta. */
  cadeira: Chair | null;
};

export type Connection = {
  a: { instanceId: string; socketId: string };
  b: { instanceId: string; socketId: string };
};

export const REJECT_REASONS = [
  "REVISAO_ANTIGA",
  "PECA_DESCONHECIDA",
  "BASE_FIXA",
  "PECA_JA_PEGUE",
  "JA_COLOCADA",
  "NAO_ESTA_NA_MAO",
  "NAO_ESTA_NA_MESA",
  "NAO_ESTA_COLOCADA",
  "FORA_DA_GRADE",
  "COLISAO",
  "ENCAIXE_INVALIDO",
  "CONSTRUCAO_ALHEIA",
  "FLUTUANDO",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const MOTIVO_TEXTO: Record<RejectReason, string> = {
  REVISAO_ANTIGA: "A sala já mudou. Essa ação ficou para trás.",
  PECA_DESCONHECIDA: "Essa peça não existe na sala.",
  BASE_FIXA: "A base da cadeira não sai do lugar.",
  PECA_JA_PEGUE: "Outra cadeira já está com essa peça.",
  JA_COLOCADA: "Essa peça já está na construção.",
  NAO_ESTA_NA_MAO: "A peça precisa estar na sua mão.",
  NAO_ESTA_NA_MESA: "A peça não está solta na mesa.",
  NAO_ESTA_COLOCADA: "Essa peça não está montada.",
  FORA_DA_GRADE: "A posição não cai na grade.",
  COLISAO: "As peças se atravessam.",
  ENCAIXE_INVALIDO: "Não existe encaixe nessa posição.",
  CONSTRUCAO_ALHEIA: "Essa construção é de outra cadeira.",
  FLUTUANDO: "A peça ficaria no ar, sem caminho até a base.",
};

export type EventType = "pegou" | "devolveu" | "encaixou" | "desmontou" | "recusou";

export type GameEvent = {
  revision: number;
  cadeira: Chair;
  tipo: EventType;
  instanceId: string;
  motivo?: RejectReason;
  pose?: Pose;
  causa?: "pedido" | "cascata";
  encaixes?: number;
};

export type RoomState = {
  revision: number;
  instances: PieceInstance[];
  connections: Connection[];
  log: GameEvent[];
};

export type Intent =
  | { type: "pegar"; chair: Chair; instanceId: string }
  | { type: "devolver"; chair: Chair; instanceId: string }
  | { type: "encaixar"; chair: Chair; instanceId: string; pose: Pose }
  | { type: "desmontar"; chair: Chair; instanceId: string };

export type IntentEnvelope = {
  baseRevision: number;
  intent: Intent;
};

export type ApplyOk = { ok: true; state: RoomState };
export type ApplyNo = { ok: false; motivo: RejectReason; state: RoomState };
export type ApplyResult = ApplyOk | ApplyNo;
