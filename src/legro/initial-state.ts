import { BASE_ORIGINS, baseId, CORES, STOCK } from "./catalog.ts";
import type { Chair, RoomState } from "./types.ts";

export function createInitialState(): RoomState {
  const instances: RoomState["instances"] = ([0, 1, 2] as Chair[]).map((chair) => {
    const origin = BASE_ORIGINS[chair];
    return {
      id: baseId(chair),
      defId: "base_12x12",
      cor: "cinza",
      holder: "fixa" as const,
      pose: { x: origin.x, y: 0, z: origin.z, yaw: 0 as const },
      cadeira: chair,
    };
  });

  let n = 1;
  for (const row of STOCK) {
    for (let i = 0; i < row.count; i++) {
      instances.push({
        id: `p${String(n).padStart(4, "0")}`,
        defId: row.defId,
        cor: CORES[(n - 1) % CORES.length]!,
        holder: "mesa",
        pose: null,
        cadeira: null,
      });
      n += 1;
    }
  }

  return { revision: 0, instances, connections: [], log: [] };
}
