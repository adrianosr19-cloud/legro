import type { ScreenNudge } from "@/legro/lab-bridge";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";

const key = "lab-btn h-11 w-11 shrink-0 p-0";

/** Cruz na tela. Direita fica à direita. O giro não empurra a peça. */
export function MovePad({
  onNudge,
  onSpin,
  onLift,
  onTilt,
}: {
  onNudge: (which: ScreenNudge) => void;
  onSpin: (sentido: "horario" | "antihorario") => void;
  onLift: (dir: 1 | -1) => void;
  onTilt?: (axis: "x" | "z", direction: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "2.75rem 2.75rem 2.75rem",
          gridTemplateRows: "2.75rem 2.75rem 2.75rem",
        }}
      >
        <button type="button" className={`${key} col-start-2 row-start-1`} aria-label="Um stud para o fundo da tela" onClick={() => onNudge("cima")}>
          <ArrowUp className="size-5" />
        </button>
        <button type="button" className={`${key} col-start-1 row-start-2`} aria-label="Um stud para a esquerda na tela" onClick={() => onNudge("esquerda")}>
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" className={`${key} col-start-3 row-start-2`} aria-label="Um stud para a direita na tela" onClick={() => onNudge("direita")}>
          <ArrowRight className="size-5" />
        </button>
        <button type="button" className={`${key} col-start-2 row-start-3`} aria-label="Um stud para a frente da tela" onClick={() => onNudge("baixo")}>
          <ArrowDown className="size-5" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <button type="button" className={key} aria-label="Girar 90 graus no sentido anti-horário" onClick={() => onSpin("antihorario")}>
          <RotateCcw className="size-5" />
        </button>
        <button type="button" className={key} aria-label="Girar 90 graus no sentido horário" onClick={() => onSpin("horario")}>
          <RotateCw className="size-5" />
        </button>
      </div>
      {onTilt ? (
        <div className="flex flex-col gap-1">
          <button type="button" className={key} aria-label="Virar a peça para frente" onClick={() => onTilt("x", 1)}><FlipVertical2 className="size-5" /></button>
          <button type="button" className={key} aria-label="Virar a peça de lado" onClick={() => onTilt("z", 1)}><FlipHorizontal2 className="size-5" /></button>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <button type="button" className="lab-btn h-11 px-3" onClick={() => onLift(1)}>
          Subir
        </button>
        <button type="button" className="lab-btn h-11 px-3" onClick={() => onLift(-1)}>
          Descer
        </button>
      </div>
    </div>
  );
}
