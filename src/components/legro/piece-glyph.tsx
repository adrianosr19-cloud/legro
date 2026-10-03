import { CATALOG } from "@/legro/catalog";
import { COR_HEX } from "@/legro/lab-bridge";

function tone(hex: string, delta: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + delta));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

/** A peça como ela é: bloco alto, placa fina, roda redonda. Não é uma bolinha. */
export function PieceGlyph({ defId, cor, size = 52 }: { defId: string; cor: string; size?: number }) {
  const def = CATALOG[defId];
  const color = COR_HEX[cor] ?? COR_HEX.cinza ?? "#8d8478";
  if (!def) return null;
  if (defId.startsWith("roda_")) {
    const radius = defId.includes("grande") ? 16 : 10;
    return (
      <svg width={size} height={size} viewBox="-22 -22 44 44" aria-hidden="true" className="shrink-0">
        <circle cx="0" cy="0" r={radius} fill={color} stroke={tone(color, -40)} strokeWidth="1.5" />
        <circle cx="0" cy="0" r={radius * 0.38} fill={tone(color, 30)} stroke={tone(color, -50)} strokeWidth="1" />
      </svg>
    );
  }
  const solids = def.cells.filter((cell) => cell.kind === "solido");
  if (solids.length === 0) return null;
  const studs = new Set(
    def.sockets.filter((socket) => socket.gender === "pino").map((socket) => `${socket.x}:${socket.y}:${socket.z}`),
  );
  const S = 8;
  const iso = (x: number, y: number, z: number) => ({
    x: (x - z) * S,
    y: (x + z) * S * 0.52 - y * S * 0.78,
  });
  const ordered = [...solids].sort((a, b) => a.x + a.z + a.y * 0.01 - (b.x + b.z + b.y * 0.01));
  const points = ordered.flatMap((cell) => {
    const corners = [
      iso(cell.x, cell.y + 1, cell.z),
      iso(cell.x + 1, cell.y + 1, cell.z),
      iso(cell.x + 1, cell.y + 1, cell.z + 1),
      iso(cell.x, cell.y + 1, cell.z + 1),
      iso(cell.x, cell.y, cell.z),
      iso(cell.x + 1, cell.y, cell.z + 1),
    ];
    return corners;
  });
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const pad = 3;
  const poly = (pts: { x: number; y: number }[]) => pts.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {ordered.map((cell) => {
        const top = [iso(cell.x, cell.y + 1, cell.z), iso(cell.x + 1, cell.y + 1, cell.z), iso(cell.x + 1, cell.y + 1, cell.z + 1), iso(cell.x, cell.y + 1, cell.z + 1)];
        const left = [iso(cell.x, cell.y + 1, cell.z + 1), iso(cell.x, cell.y + 1, cell.z), iso(cell.x, cell.y, cell.z), iso(cell.x, cell.y, cell.z + 1)];
        const right = [iso(cell.x + 1, cell.y + 1, cell.z), iso(cell.x + 1, cell.y + 1, cell.z + 1), iso(cell.x + 1, cell.y, cell.z + 1), iso(cell.x + 1, cell.y, cell.z)];
        const stud = studs.has(`${cell.x}:${cell.y}:${cell.z}`);
        const hub = iso(cell.x + 0.5, cell.y + 1, cell.z + 0.5);
        return (
          <g key={`${cell.x}:${cell.y}:${cell.z}`}>
            <polygon points={poly(left)} fill={tone(color, -36)} stroke={tone(color, -70)} strokeWidth="0.6" />
            <polygon points={poly(right)} fill={tone(color, -18)} stroke={tone(color, -70)} strokeWidth="0.6" />
            <polygon points={poly(top)} fill={color} stroke={tone(color, -55)} strokeWidth="0.6" />
            {stud ? <circle cx={hub.x} cy={hub.y} r="2.35" fill={tone(color, 36)} stroke={tone(color, -40)} strokeWidth="0.45" /> : null}
          </g>
        );
      })}
    </svg>
  );
}
