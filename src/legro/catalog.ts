import type { CellDef, CellKind, PieceDef, SocketDef } from "./types.ts";

function solidos(w: number, d: number, h: number, kind: CellKind = "solido"): CellDef[] {
  const cells: CellDef[] = [];
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      for (let y = 0; y < h; y++) cells.push({ x, y, z, kind });
    }
  }
  return cells;
}

function pinosECavidades(w: number, d: number, h: number): SocketDef[] {
  const sockets: SocketDef[] = [];
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      sockets.push({
        id: `pino-${x}-${z}`,
        x,
        y: h - 1,
        z,
        family: "bloco",
        gender: "pino",
        normal: "+y",
      });
      sockets.push({
        id: `cav-${x}-${z}`,
        x,
        y: 0,
        z,
        family: "bloco",
        gender: "cavidade",
        normal: "-y",
      });
    }
  }
  return sockets;
}

function bloco(id: string, nome: string, w: number, d: number, h: number): PieceDef {
  return {
    id,
    nome,
    fixa: false,
    cells: solidos(w, d, h),
    sockets: pinosECavidades(w, d, h),
  };
}

function base12(): PieceDef {
  return {
    id: "base_12x12",
    nome: "Base 12×12",
    fixa: true,
    cells: solidos(12, 12, 1),
    sockets: pinosECavidades(12, 12, 1).filter((s) => s.gender === "pino"),
  };
}

function rampa(): PieceDef {
  const cells: CellDef[] = [];
  const sockets: SocketDef[] = [];
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 2; z++) {
      cells.push({ x, y: 0, z, kind: "solido" });
      sockets.push({
        id: `cav-${x}-${z}`,
        x,
        y: 0,
        z,
        family: "bloco",
        gender: "cavidade",
        normal: "-y",
      });
    }
    cells.push({ x, y: 1, z: 1, kind: "solido" });
    cells.push({ x, y: 2, z: 1, kind: "solido" });
    sockets.push({
      id: `pino-${x}-1`,
      x,
      y: 2,
      z: 1,
      family: "bloco",
      gender: "pino",
      normal: "+y",
    });
  }
  return { id: "rampa_2x2", nome: "Rampa 2×2", fixa: false, cells, sockets };
}

function janela(): PieceDef {
  const cells: CellDef[] = [];
  const sockets: SocketDef[] = [];
  for (let z = 0; z < 2; z++) {
    for (let y = 0; y < 6; y++) {
      cells.push({
        x: 0,
        y,
        z,
        kind: y === 0 || y === 5 ? "solido" : "vazio",
      });
    }
    sockets.push({
      id: `cav-0-${z}`,
      x: 0,
      y: 0,
      z,
      family: "bloco",
      gender: "cavidade",
      normal: "-y",
    });
    sockets.push({
      id: `pino-0-${z}`,
      x: 0,
      y: 5,
      z,
      family: "bloco",
      gender: "pino",
      normal: "+y",
    });
  }
  return { id: "janela_1x2x2", nome: "Janela 1×2×2", fixa: false, cells, sockets };
}

function blocoFuro(): PieceDef {
  const cells: CellDef[] = [];
  const sockets: SocketDef[] = [];
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 2; z++) {
      for (let y = 0; y < 3; y++) {
        cells.push({
          x,
          y,
          z,
          kind: y === 1 && z === 0 ? "tunel" : "solido",
        });
      }
      sockets.push({
        id: `cav-${x}-${z}`,
        x,
        y: 0,
        z,
        family: "bloco",
        gender: "cavidade",
        normal: "-y",
      });
      sockets.push({
        id: `pino-${x}-${z}`,
        x,
        y: 2,
        z,
        family: "bloco",
        gender: "pino",
        normal: "+y",
      });
    }
    sockets.push({
      id: `furo-${x}`,
      x,
      y: 1,
      z: 0,
      family: "eixo",
      gender: "furo",
      axis: "x",
    });
  }
  return {
    id: "bloco_furo_eixo_2x2",
    nome: "Bloco com furo de eixo 2×2",
    fixa: false,
    cells,
    sockets,
  };
}

function eixo(): PieceDef {
  const cells: CellDef[] = [];
  const sockets: SocketDef[] = [];
  for (let x = 0; x < 4; x++) {
    cells.push({ x, y: 0, z: 0, kind: "solido" });
    sockets.push({
      id: `eixo-${x}`,
      x,
      y: 0,
      z: 0,
      family: "eixo",
      gender: "eixo",
      axis: "x",
    });
  }
  return { id: "eixo_4", nome: "Eixo 4", fixa: false, cells, sockets };
}

function roda(id: string, nome: string, raio: number): PieceDef {
  const cells: CellDef[] = [];
  for (let r = 1; r <= raio; r++) {
    cells.push({ x: 0, y: r, z: 0, kind: "solido" });
    cells.push({ x: 0, y: -r, z: 0, kind: "solido" });
    cells.push({ x: 0, y: 0, z: r, kind: "solido" });
    cells.push({ x: 0, y: 0, z: -r, kind: "solido" });
  }
  return {
    id,
    nome,
    fixa: false,
    cells,
    sockets: [{ id: "cubo", x: 0, y: 0, z: 0, family: "eixo", gender: "cubo", axis: "x" }],
  };
}

function placaComPino(
  id: string,
  nome: string,
  cells: CellDef[],
  folha: "folhaA" | "folhaB",
  pin: CellDef,
): PieceDef {
  const sockets: SocketDef[] = cells
    .map((c) => {
      return [
        {
          id: `pino-${c.x}-${c.z}`,
          x: c.x,
          y: c.y,
          z: c.z,
          family: "bloco" as const,
          gender: "pino" as const,
          normal: "+y" as const,
        },
        {
          id: `cav-${c.x}-${c.z}`,
          x: c.x,
          y: c.y,
          z: c.z,
          family: "bloco" as const,
          gender: "cavidade" as const,
          normal: "-y" as const,
        },
      ];
    })
    .flat();
  sockets.push({
    id: "folha",
    x: pin.x,
    y: pin.y,
    z: pin.z,
    family: "dobradica",
    gender: folha,
    axis: "y",
  });
  return { id, nome, fixa: false, cells, sockets };
}

const DEFS: PieceDef[] = [
  bloco("bloco_2x4", "Bloco 2×4", 2, 4, 3),
  bloco("bloco_2x2", "Bloco 2×2", 2, 2, 3),
  bloco("bloco_1x2", "Bloco 1×2", 1, 2, 3),
  bloco("bloco_1x4", "Bloco 1×4", 1, 4, 3),
  bloco("bloco_2x3", "Bloco 2×3", 2, 3, 3),
  bloco("bloco_1x1", "Bloco 1×1", 1, 1, 3),
  bloco("bloco_1x3", "Bloco 1×3", 1, 3, 3),
  bloco("bloco_1x6", "Bloco 1×6", 1, 6, 3),
  bloco("bloco_2x6", "Bloco 2×6", 2, 6, 3),
  bloco("coluna_1x1x2", "Coluna 1×1×2", 1, 1, 6),
  bloco("coluna_1x2x2", "Coluna 1×2×2", 1, 2, 6),
  bloco("placa_2x4", "Placa 2×4", 2, 4, 1),
  bloco("placa_2x2", "Placa 2×2", 2, 2, 1),
  bloco("placa_1x2", "Placa 1×2", 1, 2, 1),
  bloco("placa_4x4", "Placa 4×4", 4, 4, 1),
  bloco("placa_1x4", "Placa 1×4", 1, 4, 1),
  bloco("placa_1x6", "Placa 1×6", 1, 6, 1),
  bloco("placa_2x6", "Placa 2×6", 2, 6, 1),
  bloco("placa_2x8", "Placa 2×8", 2, 8, 1),
  bloco("placa_4x6", "Placa 4×6", 4, 6, 1),
  rampa(),
  bloco("viga_1x4", "Viga 1×4", 1, 4, 2),
  bloco("viga_1x6", "Viga 1×6", 1, 6, 2),
  bloco("pilar_2x2x2", "Pilar 2×2×2", 2, 2, 6),
  janela(),
  blocoFuro(),
  eixo(),
  roda("roda_grande", "Roda grande", 2),
  roda("roda_pequena", "Roda pequena", 1),
  placaComPino(
    "dobradica_a",
    "Dobradiça A",
    [
      { x: 1, y: 0, z: 0, kind: "solido" },
      { x: 2, y: 0, z: 0, kind: "solido" },
    ],
    "folhaA",
    { x: 0, y: 0, z: 0, kind: "solido" },
  ),
  placaComPino(
    "dobradica_b",
    "Dobradiça B",
    [
      { x: -1, y: 0, z: 0, kind: "solido" },
      { x: -2, y: 0, z: 0, kind: "solido" },
    ],
    "folhaB",
    { x: 0, y: 0, z: 0, kind: "solido" },
  ),
  base12(),
];

function indexar(defs: PieceDef[]): Record<string, PieceDef> {
  const out: Record<string, PieceDef> = {};
  for (const def of defs) {
    if (out[def.id]) throw new Error(`catálogo duplicado: ${def.id}`);
    const seenCell = new Set<string>();
    for (const cell of def.cells) {
      const key = `${cell.x},${cell.y},${cell.z}`;
      if (seenCell.has(key)) throw new Error(`célula duplicada em ${def.id}: ${key}`);
      seenCell.add(key);
    }
    const seenSocket = new Set<string>();
    for (const socket of def.sockets) {
      if (seenSocket.has(socket.id)) {
        throw new Error(`soquete duplicado em ${def.id}: ${socket.id}`);
      }
      seenSocket.add(socket.id);
    }
    out[def.id] = def;
  }
  return out;
}

export const CATALOG = indexar(DEFS);

/** Catálogo expandido. A base fixa não entra na caixa de peças. */
export const BAG_IDS = [
  "bloco_2x4",
  "bloco_2x2",
  "bloco_1x2",
  "bloco_1x4",
  "bloco_2x3",
  "bloco_1x1",
  "bloco_1x3",
  "bloco_1x6",
  "bloco_2x6",
  "coluna_1x1x2",
  "coluna_1x2x2",
  "placa_2x4",
  "placa_2x2",
  "placa_1x2",
  "placa_4x4",
  "placa_1x4",
  "placa_1x6",
  "placa_2x6",
  "placa_2x8",
  "placa_4x6",
  "rampa_2x2",
  "viga_1x4",
  "viga_1x6",
  "pilar_2x2x2",
  "janela_1x2x2",
  "bloco_furo_eixo_2x2",
  "eixo_4",
  "roda_grande",
  "roda_pequena",
  "dobradica_a",
  "dobradica_b",
] as const;

export const STOCK: { defId: (typeof BAG_IDS)[number]; count: number }[] = [
  { defId: "bloco_2x4", count: 8 },
  { defId: "bloco_2x2", count: 8 },
  { defId: "bloco_1x2", count: 8 },
  { defId: "bloco_1x4", count: 6 },
  { defId: "bloco_2x3", count: 6 },
  { defId: "bloco_1x1", count: 8 },
  { defId: "bloco_1x3", count: 8 },
  { defId: "bloco_1x6", count: 6 },
  { defId: "bloco_2x6", count: 6 },
  { defId: "coluna_1x1x2", count: 6 },
  { defId: "coluna_1x2x2", count: 4 },
  { defId: "placa_2x4", count: 6 },
  { defId: "placa_2x2", count: 6 },
  { defId: "placa_1x2", count: 6 },
  { defId: "placa_4x4", count: 4 },
  { defId: "placa_1x4", count: 6 },
  { defId: "placa_1x6", count: 6 },
  { defId: "placa_2x6", count: 5 },
  { defId: "placa_2x8", count: 4 },
  { defId: "placa_4x6", count: 4 },
  { defId: "rampa_2x2", count: 6 },
  { defId: "viga_1x4", count: 6 },
  { defId: "viga_1x6", count: 6 },
  { defId: "pilar_2x2x2", count: 4 },
  { defId: "janela_1x2x2", count: 4 },
  { defId: "bloco_furo_eixo_2x2", count: 4 },
  { defId: "eixo_4", count: 4 },
  { defId: "roda_grande", count: 4 },
  { defId: "roda_pequena", count: 4 },
  { defId: "dobradica_a", count: 4 },
  { defId: "dobradica_b", count: 4 },
];

export const CORES = [
  "vermelho",
  "azul",
  "amarelo",
  "verde",
  "branco",
  "preto",
  "laranja",
] as const;

export const BASE_ORIGINS: Record<0 | 1 | 2, { x: number; z: number }> = {
  0: { x: 0, z: 0 },
  1: { x: 20, z: 0 },
  2: { x: 40, z: 0 },
};

export function baseId(chair: 0 | 1 | 2): string {
  return `base-${chair}`;
}
