import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useLayoutEffect, useRef } from "react";
import { PerspectiveCamera } from "three";
import { CATALOG } from "@/legro/catalog";
import {
  COR_HEX,
  GHOST_NO,
  GHOST_OK,
  INK,
  PAPER,
  PLATE,
  poseFromPoint,
  STUD,
  WOOD,
} from "@/legro/lab-bridge";
import type { Pose, Yaw } from "@/legro/types";

export type ScenePiece = {
  id: string;
  defId: string;
  cor: string;
  pose: Pose;
  fixa: boolean;
};

export type SceneGhost = {
  defId: string;
  cor: string;
  pose: Pose;
  ok: boolean;
};

type SceneProps = {
  pieces: ScenePiece[];
  ghost: SceneGhost | null;
  yaw: Yaw;
  viewTurn: number;
  onAim: (pose: Pose) => void;
  onCommit: (pose: Pose) => void;
  onDetach: (id: string) => void;
  /** 1 é o laboratório. 3 é a sala, sem mudar o encaixe. */
  tables?: 1 | 3;
  focus?: { cx: number; cz: number; radius: number; height: number; fov: number };
  /** Arrastar gira só a vista. Não existe na construção. */
  onInspectTurn?: (delta: number) => void;
  /** Inclinação livre da peça que está na mão. Não altera a lei de encaixe até o snap. */
  heldTilt?: { x: number; z: number };
};

function CameraRig({ turn, focus }: { turn: number; focus?: SceneProps["focus"] }) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const cx = focus?.cx ?? 4 * STUD;
    const cz = focus?.cz ?? 4 * STUD;
    const radius = focus?.radius ?? 2.2;
    const height = focus?.height ?? 1.35;
    if (camera instanceof PerspectiveCamera) camera.fov = focus?.fov ?? 40;
    camera.position.set(cx + Math.sin(turn) * radius, height, cz + Math.cos(turn) * radius);
    camera.lookAt(cx, 0.12, cz);
    camera.updateProjectionMatrix();
  }, [camera, focus, turn]);
  return null;
}

function StudGrid({ origin = 0 }: { origin?: number }) {
  const y = PLATE + 0.003;
  const lines = [];
  for (let i = 0; i <= 12; i++) {
    lines.push(
      <Line
        key={`a${origin}-${i}`}
        points={[
          [(origin + i) * STUD, y, 0],
          [(origin + i) * STUD, y, 12 * STUD],
        ]}
        color={INK}
        lineWidth={1}
        transparent
        opacity={0.28}
      />,
      <Line
        key={`b${origin}-${i}`}
        points={[
          [origin * STUD, y, i * STUD],
          [(origin + 12) * STUD, y, i * STUD],
        ]}
        color={INK}
        lineWidth={1}
        transparent
        opacity={0.28}
      />,
    );
  }
  return <group>{lines}</group>;
}

function Cells({
  defId,
  cor,
  ghost,
  ok,
  pieceId,
  yaw,
  holding,
  onAim,
  onCommit,
  onDetach,
  onInspectDown,
  onInspectMove,
  onInspectUp,
}: {
  defId: string;
  cor: string;
  ghost?: boolean;
  ok?: boolean;
  pieceId?: string;
  yaw: Yaw;
  holding: boolean;
  onAim: (pose: Pose) => void;
  onCommit: (pose: Pose) => void;
  onDetach: (id: string) => void;
  onInspectDown?: (event: ThreeEvent<PointerEvent>) => void;
  onInspectMove?: (event: ThreeEvent<PointerEvent>) => boolean;
  onInspectUp?: (event: ThreeEvent<PointerEvent>) => boolean;
}) {
  const def = CATALOG[defId];
  if (!def) return null;
  const color = COR_HEX[cor] ?? COR_HEX.cinza ?? INK;
  const fromEvent = (event: ThreeEvent<PointerEvent>) =>
    poseFromPoint(event.point.x, event.point.y, event.point.z, yaw);

  return (
    <>
      {def.cells
        .filter((cell) => cell.kind === "solido")
        .map((cell) => (
          <mesh
            key={`${cell.x}:${cell.y}:${cell.z}`}
            position={[(cell.x + 0.5) * STUD, (cell.y + 0.5) * PLATE, (cell.z + 0.5) * STUD]}
            userData={{ pieceId }}
            raycast={ghost ? () => null : undefined}
            onPointerDown={(event) => {
              if (!onInspectDown) return;
              onInspectDown(event);
            }}
            onPointerMove={(event) => {
              if (onInspectMove?.(event)) return;
              if (!holding) return;
              event.stopPropagation();
              onAim(fromEvent(event));
            }}
            onPointerUp={(event) => {
              if (onInspectUp?.(event)) return;
              if (ghost || !pieceId || event.button !== 0) return;
              event.stopPropagation();
              if (holding) {
                const next = fromEvent(event);
                onAim(next);
                onCommit(next);
                return;
              }
              if (!def.fixa) onDetach(pieceId);
            }}
          >
            <boxGeometry args={[STUD * 0.92, PLATE * 0.92, STUD * 0.92]} />
            <meshStandardMaterial
              color={ghost ? (ok ? GHOST_OK : GHOST_NO) : color}
              roughness={0.45}
              metalness={0.02}
              transparent={ghost}
              opacity={ghost ? 0.42 : 1}
              emissive={ghost ? (ok ? GHOST_OK : GHOST_NO) : INK}
              emissiveIntensity={ghost ? 0.35 : 0}
              depthWrite={!ghost}
            />
          </mesh>
        ))}
      {def.sockets
        .filter((socket) => socket.gender === "pino")
        .map((socket) => (
          <mesh
            key={socket.id}
            position={[
              (socket.x + 0.5) * STUD,
              (socket.y + 1) * PLATE + PLATE * 0.22,
              (socket.z + 0.5) * STUD,
            ]}
            raycast={() => null}
          >
            <cylinderGeometry args={[STUD * 0.28, STUD * 0.28, PLATE * 0.42, 12]} />
            <meshStandardMaterial
              color={ghost ? (ok ? GHOST_OK : GHOST_NO) : color}
              roughness={0.42}
              transparent={ghost}
              opacity={ghost ? 0.42 : 1}
              emissive={ghost ? (ok ? GHOST_OK : GHOST_NO) : INK}
              emissiveIntensity={ghost ? 0.35 : 0}
              depthWrite={!ghost}
            />
          </mesh>
        ))}
    </>
  );
}

function PieceGroup({
  piece,
  yaw,
  holding,
  onAim,
  onCommit,
  onDetach,
  onInspectDown,
  onInspectMove,
  onInspectUp,
}: {
  piece: ScenePiece;
  yaw: Yaw;
  holding: boolean;
  onAim: (pose: Pose) => void;
  onCommit: (pose: Pose) => void;
  onDetach: (id: string) => void;
  onInspectDown?: (event: ThreeEvent<PointerEvent>) => void;
  onInspectMove?: (event: ThreeEvent<PointerEvent>) => boolean;
  onInspectUp?: (event: ThreeEvent<PointerEvent>) => boolean;
}) {
  return (
    <group
      position={[piece.pose.x * STUD, piece.pose.y * PLATE, piece.pose.z * STUD]}
      rotation={[0, (piece.pose.yaw * Math.PI) / 2, 0]}
    >
      <Cells
        defId={piece.defId}
        cor={piece.cor}
        pieceId={piece.id}
        yaw={yaw}
        holding={holding}
        onAim={onAim}
        onCommit={onCommit}
        onDetach={onDetach}
        onInspectDown={onInspectDown}
        onInspectMove={onInspectMove}
        onInspectUp={onInspectUp}
      />
    </group>
  );
}

function GhostGroup({ ghost, tilt }: { ghost: SceneGhost; tilt?: { x: number; z: number } }) {
  return (
    <group
      position={[ghost.pose.x * STUD, ghost.pose.y * PLATE, ghost.pose.z * STUD]}
      rotation={[tilt?.x ?? 0, (ghost.pose.yaw * Math.PI) / 2, tilt?.z ?? 0]}
    >
      <Cells
        defId={ghost.defId}
        cor={ghost.cor}
        yaw={ghost.pose.yaw}
        ghost
        ok={ghost.ok}
        holding={false}
        onAim={() => undefined}
        onCommit={() => undefined}
        onDetach={() => undefined}
      />
    </group>
  );
}

const CHAIR_MARK = [COR_HEX.vermelho, COR_HEX.azul, COR_HEX.amarelo];

function World({ pieces, ghost, yaw, viewTurn, onAim, onCommit, onDetach, tables = 1, focus, onInspectTurn, heldTilt }: SceneProps) {
  const holding = ghost !== null;
  const wide = tables === 3;
  const dragX = useRef<number | null>(null);
  const inspectDown = (event: ThreeEvent<PointerEvent>) => {
    if (!onInspectTurn) return;
    dragX.current = event.nativeEvent.clientX;
    const target = event.nativeEvent.target;
    if (target instanceof Element) target.setPointerCapture(event.nativeEvent.pointerId);
    event.stopPropagation();
  };
  const inspectMove = (event: ThreeEvent<PointerEvent>) => {
    if (!onInspectTurn || dragX.current == null) return false;
    const x = event.nativeEvent.clientX;
    const dx = x - dragX.current;
    dragX.current = x;
    if (dx !== 0) onInspectTurn(dx * 0.008);
    event.stopPropagation();
    return true;
  };
  const inspectUp = (event: ThreeEvent<PointerEvent>) => {
    if (!onInspectTurn || dragX.current == null) return false;
    dragX.current = null;
    event.stopPropagation();
    return true;
  };
  const aimFromEvent = (event: ThreeEvent<PointerEvent>, commit: boolean) => {
    if (!holding) return;
    if (commit && event.button !== 0) return;
    event.stopPropagation();
    const next = poseFromPoint(event.point.x, event.point.y, event.point.z, yaw);
    onAim(next);
    if (commit) onCommit(next);
  };
  const origins = wide ? [0, 20, 40] : [0];

  return (
    <>
      <color attach="background" args={[PAPER]} />
      <hemisphereLight args={[PAPER, WOOD, 0.9]} />
      <directionalLight position={[1.6, 3.4, 1.2]} intensity={1.2} />
      <CameraRig turn={viewTurn} focus={focus} />
      {wide ? (
        origins.map((origin) => (
          <mesh key={origin} position={[(origin + 6) * STUD, -0.09, 6 * STUD]} raycast={() => null}>
            <boxGeometry args={[16 * STUD, 0.18, 16 * STUD]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
        ))
      ) : (
        <mesh position={[4 * STUD, -0.09, 4 * STUD]} raycast={() => null}>
          <boxGeometry args={[24 * STUD, 0.18, 20 * STUD]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      )}
      {wide
        ? origins.map((origin, index) => (
            <mesh key={`mark-${origin}`} position={[(origin - 0.7) * STUD, 0.05, -0.7 * STUD]} raycast={() => null}>
              <sphereGeometry args={[0.07, 16, 16]} />
              <meshStandardMaterial color={CHAIR_MARK[index]} />
            </mesh>
          ))
        : null}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[wide ? 26 * STUD : 6 * STUD, 0.004, 6 * STUD]}
        onPointerDown={inspectDown}
        onPointerMove={(event) => {
          if (inspectMove(event)) return;
          aimFromEvent(event, false);
        }}
        onPointerUp={(event) => {
          if (inspectUp(event)) return;
          aimFromEvent(event, true);
        }}
      >
        <planeGeometry args={[wide ? 60 * STUD : 24 * STUD, 24 * STUD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {origins.map((origin) => (
        <StudGrid key={origin} origin={origin} />
      ))}
      {pieces.map((piece) => (
        <PieceGroup
          key={piece.id}
          piece={piece}
          yaw={yaw}
          holding={holding}
          onAim={onAim}
          onCommit={onCommit}
          onDetach={onDetach}
          onInspectDown={onInspectTurn ? inspectDown : undefined}
          onInspectMove={onInspectTurn ? inspectMove : undefined}
          onInspectUp={onInspectTurn ? inspectUp : undefined}
        />
      ))}
      {ghost ? <GhostGroup ghost={ghost} tilt={heldTilt} /> : null}
    </>
  );
}

export function TableScene(props: SceneProps) {
  return (
    <Canvas camera={{ fov: 40, near: 0.05, far: 80, position: [1.6, 1.35, 2.4] }} dpr={[1, 1.6]}>
      <World {...props} />
    </Canvas>
  );
}
