import { CATALOG } from "./catalog.ts";
import { applyIntent } from "./reducer.ts";
import type { ApplyResult, Chair, Pose, RoomState } from "./types.ts";

/**
 * Move uma peça já colocada sem deixar a desmontagem em cascata aparecer na UI.
 *
 * A lei existente continua sendo a autoridade: desmontamos a peça, descobrimos
 * exatamente quais peças perderiam o caminho até a base e tentamos recolocar
 * todo esse subconjunto com a mesma translação. Se qualquer recolocação falhar,
 * devolvemos o estado original inteiro. Assim um arraste inválido nunca "engole"
 * peças da construção.
 */
export function moveAssemblyAtomically(
  state: RoomState,
  chair: Chair,
  instanceId: string,
  targetPose: Pose,
): ApplyResult {
  const selected = state.instances.find((piece) => piece.id === instanceId);
  if (!selected?.pose) {
    return applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "desmontar", chair, instanceId },
    });
  }

  const def = CATALOG[selected.defId];
  if (!def || def.fixa || selected.holder === "fixa") {
    return applyIntent(state, {
      baseRevision: state.revision,
      intent: { type: "desmontar", chair, instanceId },
    });
  }

  const originalPose = selected.pose;
  const normalizedTarget: Pose = {
    ...originalPose,
    x: targetPose.x,
    y: targetPose.y,
    z: targetPose.z,
  };

  if (
    originalPose.x === normalizedTarget.x &&
    originalPose.y === normalizedTarget.y &&
    originalPose.z === normalizedTarget.z
  ) {
    return { ok: true, state };
  }

  const detached = applyIntent(state, {
    baseRevision: state.revision,
    intent: { type: "desmontar", chair, instanceId },
  });
  if (!detached.ok) return detached;

  const removed = state.instances
    .filter((before) => {
      if (!before.pose || before.cadeira !== chair) return false;
      const after = detached.state.instances.find((piece) => piece.id === before.id);
      return !!after && after.pose === null && after.holder === chair;
    })
    .map((piece) => ({ piece, pose: piece.pose! }));

  const dx = normalizedTarget.x - originalPose.x;
  const dy = normalizedTarget.y - originalPose.y;
  const dz = normalizedTarget.z - originalPose.z;

  removed.sort((a, b) => {
    if (a.piece.id === instanceId) return -1;
    if (b.piece.id === instanceId) return 1;
    if (a.pose.y !== b.pose.y) return a.pose.y - b.pose.y;
    return a.piece.id.localeCompare(b.piece.id);
  });

  let current = detached.state;
  for (const { piece, pose } of removed) {
    const nextPose: Pose = {
      ...pose,
      x: pose.x + dx,
      y: pose.y + dy,
      z: pose.z + dz,
    };
    const placed = applyIntent(current, {
      baseRevision: current.revision,
      intent: { type: "encaixar", chair, instanceId: piece.id, pose: nextPose },
    });
    if (!placed.ok) {
      return { ok: false, motivo: placed.motivo, state };
    }
    current = placed.state;
  }

  return { ok: true, state: current };
}
