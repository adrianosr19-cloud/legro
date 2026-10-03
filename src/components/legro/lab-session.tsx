import { CATALOG } from "@/legro/catalog";
import {
  bandeja,
  devolverPeca,
  desmontarPeca,
  LAB_CHAIR,
  lerPrevia,
  pecasNaMesa,
  pegarPeca,
  spinPiece,
  stepPose,
  tiltPiece,
  tentarEncaixe,
} from "@/legro/lab-bridge";
import { createInitialState } from "@/legro/initial-state";
import { MOTIVO_TEXTO } from "@/legro/types";
import type { Pose, RoomState } from "@/legro/types";
import { ChevronLeft, ChevronRight, PackageOpen, RotateCcw, Undo2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SceneGhost, ScenePiece } from "./table-scene";
import { MovePad } from "./move-pad";
import { PieceGlyph } from "./piece-glyph";

function adopt(result: { ok: boolean; state: RoomState }, setState: (s: RoomState) => void) {
  setState(result.state);
  return result.ok;
}

export function LabSession() {
  const [state, setState] = useState(createInitialState);
  const [selected, setSelected] = useState<string | null>(null);
  const [pose, setPose] = useState<Pose>({ x: 2, y: 1, z: 2, yaw: 0 });
  const [viewTurn, setViewTurn] = useState(0.55);
  const [boxOpen, setBoxOpen] = useState(false);
  const [trayIndex, setTrayIndex] = useState(0);
  const [Scene, setScene] = useState<typeof import("./table-scene").TableScene | null>(null);

  useEffect(() => {
    void import("./table-scene").then((mod) => setScene(() => mod.TableScene));
  }, []);

  const piece = state.instances.find((item) => item.id === selected) ?? null;
  const inHand = piece?.holder === LAB_CHAIR && piece.pose === null;
  const previa = inHand && piece ? lerPrevia(state, piece.id, pose) : null;
  const tray = bandeja(state);
  const safeTrayIndex = tray.length === 0 ? 0 : ((trayIndex % tray.length) + tray.length) % tray.length;
  const currentTray = tray[safeTrayIndex] ?? null;
  const placed: ScenePiece[] = pecasNaMesa(state).flatMap((item) => {
    if (!item.pose) return [];
    return [
      {
        id: item.id,
        defId: item.defId,
        cor: item.cor,
        pose: item.pose,
        fixa: CATALOG[item.defId]?.fixa ?? false,
      },
    ];
  });
  const ghost: SceneGhost | null =
    inHand && piece && previa
      ? { defId: piece.defId, cor: piece.cor, pose, ok: previa.ok }
      : null;

  function pick(id: string) {
    const result = pegarPeca(state, id);
    adopt(result, setState);
    if (result.ok) {
      setSelected(id);
      setPose({ x: 2, y: 1, z: 2, yaw: 0 });
    }
  }

  function giveBack() {
    if (!selected) return;
    const result = devolverPeca(state, selected);
    adopt(result, setState);
    if (result.ok) setSelected(null);
  }

  function detach(id: string) {
    const result = desmontarPeca(state, id);
    adopt(result, setState);
    if (result.ok) {
      setSelected(id);
      setPose((current) => ({ x: 2, y: 1, z: 2, yaw: current.yaw }));
    }
  }

  function commit(next: Pose) {
    if (!selected) return;
    const result = tentarEncaixe(state, selected, next);
    adopt(result, setState);
    setPose(next);
    if (result.ok) setSelected(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "q") setViewTurn((turn) => turn + Math.PI / 2);
      if (event.key === "e") setViewTurn((turn) => turn - Math.PI / 2);
      if (!inHand || !selected || !piece) return;
      if (event.key === "r" || event.key === "R") {
        setPose((current) => spinPiece(piece.defId, current, "horario"));
      }
      if (event.key === "ArrowLeft") setPose((current) => stepPose(current, viewTurn, "esquerda"));
      if (event.key === "ArrowRight") setPose((current) => stepPose(current, viewTurn, "direita"));
      if (event.key === "ArrowUp") setPose((current) => stepPose(current, viewTurn, "cima"));
      if (event.key === "ArrowDown") setPose((current) => stepPose(current, viewTurn, "baixo"));
      if (event.key === "[") setPose((current) => ({ ...current, y: current.y - 1 }));
      if (event.key === "]") setPose((current) => ({ ...current, y: current.y + 1 }));
      if (event.key === "Enter") {
        const result = tentarEncaixe(state, selected, pose);
        setState(result.state);
        if (result.ok) setSelected(null);
      }
      if (event.key === "Escape") {
        const result = devolverPeca(state, selected);
        setState(result.state);
        if (result.ok) setSelected(null);
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inHand, piece, pose, selected, state, viewTurn]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-dock/90 px-4 py-2">
        <div>
          <p className="font-display text-xl leading-none">LEGRO</p>
          <p className="mt-1 text-xs text-muted">Pegue, gire, encaixe e construa.</p>
        </div>
        <button type="button" className="lab-btn" onClick={() => { setState(createInitialState()); setSelected(null); setBoxOpen(false); }}>
          <RotateCcw className="size-4" /> Recomeçar
        </button>
      </header>

      <div className="relative min-h-0 flex-1 touch-none">
        {Scene ? (
          <Scene pieces={placed} ghost={ghost} yaw={pose.yaw} viewTurn={viewTurn} onAim={setPose} onCommit={commit} onDetach={detach} focus={{ cx: 6 * 0.28, cz: 6 * 0.28, radius: 4.15, height: 2.15, fov: 42 }} />
        ) : (
          <div className="grid h-full place-items-center"><p className="text-sm text-muted">Abrindo a mesa…</p></div>
        )}

        <div className="absolute left-3 top-3 flex flex-col gap-2">
          <button type="button" className="lab-btn bg-dock/95" onClick={() => setViewTurn((t) => t + Math.PI / 2)} aria-label="Girar a vista">
            <RotateCcw className="size-4" /> Vista
          </button>
        </div>

        {inHand && piece ? (
          <div className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] rounded-2xl border border-line bg-dock/95 p-3 shadow-lg backdrop-blur">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">Mover peça</p>
            <MovePad onNudge={(which) => setPose((current) => stepPose(current, viewTurn, which))} onSpin={(sentido) => setPose((current) => spinPiece(piece.defId, current, sentido))} onTilt={(axis, direction) => setPose((current) => tiltPiece(current, axis, direction))} onLift={(dir) => setPose((current) => ({ ...current, y: Math.max(0, current.y + dir) }))} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="lab-btn bg-ink text-paper" onClick={() => commit(pose)}>Encaixar</button>
              <button type="button" className="lab-btn" onClick={giveBack}><Undo2 className="size-4" /> Guardar</button>
            </div>
            <p className={previa?.ok ? "mt-2 text-center text-xs text-ok" : "mt-2 text-center text-xs text-no"}>
              {previa?.ok ? "Pode encaixar aqui" : previa ? MOTIVO_TEXTO[previa.motivo] : ""}
            </p>
          </div>
        ) : null}

        <div className="absolute bottom-3 left-1/2 w-[min(94%,34rem)] -translate-x-1/2">
          {!boxOpen ? (
            <button type="button" className="mx-auto flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-dock/95 px-5 py-3 shadow-lg backdrop-blur" onClick={() => setBoxOpen(true)}>
              <PackageOpen className="size-7" />
              <span className="text-left"><span className="block font-semibold">Caixa de peças</span><span className="block text-xs text-muted">Toque para abrir</span></span>
            </button>
          ) : (
            <section className="rounded-3xl border border-line bg-dock/95 p-3 shadow-xl backdrop-blur" aria-label="Caixa de peças">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">Escolha uma peça</span>
                <button type="button" className="grid size-11 place-items-center rounded-xl border border-line" onClick={() => setBoxOpen(false)} aria-label="Fechar caixa"><X className="size-5" /></button>
              </div>
              {currentTray ? (
                <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                  <button type="button" className="grid size-12 place-items-center rounded-2xl border border-line bg-paper" onClick={() => setTrayIndex((i) => i - 1)} aria-label="Peça anterior"><ChevronLeft className="size-7" /></button>
                  <button type="button" className="flex min-h-28 items-center justify-center gap-4 rounded-2xl border-2 border-line bg-paper px-4 py-3" onClick={() => pick(currentTray.sampleId)}>
                    <PieceGlyph defId={currentTray.defId} cor={currentTray.cores[0] ?? "cinza"} size={82} />
                    <span className="min-w-0 text-left"><span className="block text-base font-semibold">{currentTray.nome}</span><span className="block text-sm capitalize text-muted">{currentTray.cores[0]} · {currentTray.count} disponíveis</span><span className="mt-1 block text-xs text-muted">Toque para pegar</span></span>
                  </button>
                  <button type="button" className="grid size-12 place-items-center rounded-2xl border border-line bg-paper" onClick={() => setTrayIndex((i) => i + 1)} aria-label="Próxima peça"><ChevronRight className="size-7" /></button>
                </div>
              ) : <p className="py-6 text-center text-sm text-muted">Todas as peças estão em uso.</p>}
              <div className="mt-2 flex justify-center gap-1" aria-hidden="true">
                {tray.slice(0, 12).map((_, i) => <span key={i} className={i === safeTrayIndex ? "h-1.5 w-5 rounded-full bg-ink" : "size-1.5 rounded-full bg-line"} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
