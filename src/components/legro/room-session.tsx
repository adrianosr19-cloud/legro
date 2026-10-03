import { BASE_ORIGINS, CATALOG } from "@/legro/catalog";
import { bandeja, spinPiece, stepPose, STUD, yawDegrees } from "@/legro/lab-bridge";
import { CADEIRA_NOME, SALA_TEXTO, textoDaLei, textoDoFato } from "@/legro/room-copy";
import type { MatchReport } from "@/legro/report";
import { readCred, writeCred, type RoomCred } from "@/legro/room-cred";
import { answerLoan, answerSeat, askLoan, pollSeat, readSala, requestSeat, returnLoan, sendIntent, startSala } from "@/legro/room-fns";
import type { ClientIntent, PublicRoom, RoomEnvelope } from "@/legro/room-service";
import { applyIntent } from "@/legro/reducer";
import type { Chair, Pose } from "@/legro/types";
import { Link } from "@tanstack/react-router";
import { RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneGhost, ScenePiece } from "./table-scene";
import { MovePad } from "./move-pad";
import { PieceGlyph } from "./piece-glyph";

const MARK = ["bg-brick-red", "bg-brick-blue", "bg-brick-yellow"];

function text(motivo: string | null | undefined) {
  if (!motivo) return "A sala não respondeu.";
  return SALA_TEXTO[motivo] ?? motivo;
}

function homePose(chair: Chair): Pose {
  const origin = BASE_ORIGINS[chair];
  return { x: origin.x + 2, y: 1, z: origin.z + 2, yaw: 0 };
}

function Clock({
  startedAt,
  durationMs,
  phase,
  offsetRef,
}: {
  startedAt: number | null;
  durationMs: number;
  phase: PublicRoom["phase"];
  offsetRef: { current: number };
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  if (phase === "espera" || startedAt == null) return <>Ainda não começou</>;
  if (phase === "exposicao") return <>Tempo encerrado</>;
  const remain = Math.max(0, startedAt + durationMs - (Date.now() + offsetRef.current));
  const total = Math.ceil(remain / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return (
    <>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </>
  );
}

export function RoomSession({ code }: { code: string }) {
  const clean = code.toUpperCase();
  const [cred, setCred] = useState<RoomCred>(() => readCred(clean));
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pose, setPose] = useState<Pose>({ x: 2, y: 1, z: 2, yaw: 0 });
  const [viewTurn, setViewTurn] = useState(0.55);
  const [inspecao, setInspecao] = useState<"todas" | "minha" | Chair>("minha");
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [chairPick, setChairPick] = useState<Chair>(1);
  const [Scene, setScene] = useState<typeof import("./table-scene").TableScene | null>(null);
  const rev = useRef(-1);
  const lawRev = useRef(0);
  const offsetRef = useRef(0);
  const busy = useRef(false);

  function save(next: RoomCred) {
    writeCred(clean, next);
    setCred(next);
  }

  function adopt(next: PublicRoom | null) {
    if (!next) return;
    offsetRef.current = next.serverNow - Date.now();
    if (next.roomRevision < rev.current) return;
    if (next.roomRevision === rev.current) return;
    rev.current = next.roomRevision;
    lawRev.current = next.law.revision;
    setRoom(next);
  }

  useEffect(() => {
    void import("./table-scene").then((mod) => setScene(() => mod.TableScene));
  }, []);

  useEffect(() => {
    const read = () => setNarrow(window.innerWidth < 800);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useEffect(() => {
    if (offline) return;
    let stop = false;
    async function pull() {
      const current = readCred(clean);
      if (current.requestId && current.requestSecret && !current.seatToken) {
        const result = await pollSeat({
          data: { code: clean, requestId: current.requestId, requestSecret: current.requestSecret },
        });
        if (stop) return;
        if (result.status === "aceito" && result.seatToken) {
          save({ ...current, seatToken: result.seatToken, chair: result.room?.you?.chair ?? current.chair });
        } else if (result.status === "recusado") {
          save({ chair: current.chair });
          setNotice("O anfitrião recusou esta cadeira.");
        }
        adopt(result.room);
        return;
      }
      if (!current.seatToken) return;
      const result = await readSala({
        data: { code: clean, seatToken: current.seatToken, hostSecret: current.hostSecret ?? null },
      });
      if (stop) return;
      if (!result.ok) {
        setNotice(text(result.motivo));
        return;
      }
      adopt(result.room);
    }
    void pull().catch(() => setNotice("A sala não respondeu."));
    const id = window.setInterval(() => {
      void pull().catch(() => setNotice("A sala não respondeu."));
    }, 500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
    // save/adopt são estáveis o bastante: leem refs e localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, offline, cred.seatToken, cred.requestId]);

  const myChair = room?.you?.chair ?? null;
  const piece = room?.law.instances.find((item) => item.id === selected) ?? null;
  const inHand = !!piece && piece.holder === myChair && piece.pose === null && room?.phase === "construindo" && !offline;
  const previa = useMemo(() => {
    if (!inHand || !piece || !room || myChair == null) return null;
    const result = applyIntent(room.law, {
      baseRevision: room.law.revision,
      intent: { type: "encaixar", chair: myChair, instanceId: piece.id, pose },
    });
    if (result.ok) return { ok: true as const };
    return { ok: false as const, motivo: result.motivo };
  }, [inHand, myChair, piece, pose, room]);

  const placed: ScenePiece[] = useMemo(() => {
    if (!room) return [];
    return room.law.instances.flatMap((item) => {
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
  }, [room]);

  const alvo = inspecao === "minha" ? myChair : inspecao === "todas" ? null : inspecao;
  const focus = useMemo(() => {
    if (alvo != null) {
      const origin = BASE_ORIGINS[alvo];
      return { cx: (origin.x + 4) * STUD, cz: (origin.z + 4) * STUD, radius: 2.2, height: 1.35, fov: 40 };
    }
    if (narrow) return { cx: 20 * STUD, cz: 4 * STUD, radius: 17.2, height: 12.4, fov: 54 };
    return { cx: 20 * STUD, cz: 4 * STUD, radius: 12.6, height: 8.4, fov: 48 };
  }, [alvo, narrow]);

  const tray = room ? bandeja(room.law) : [];
  const hand = room
    ? room.law.instances.filter((item) => item.holder === myChair && item.pose === null)
    : [];
  const others = room
    ? room.law.instances.filter(
        (item) => typeof item.holder === "number" && item.holder !== myChair && item.pose === null,
      )
    : [];
  const loans = room?.loans ?? [];
  const incoming = loans.filter((item) => item.status === "pendente" && item.from === myChair);
  const outgoing = loans.filter((item) => item.status === "pendente" && item.to === myChair);
  const borrowed = loans.filter((item) => item.status === "aceito" && item.to === myChair);
  const history = room?.history ?? [];
  const ghost: SceneGhost | null =
    inHand && piece && previa ? { defId: piece.defId, cor: piece.cor, pose, ok: previa.ok } : null;

  async function send(intent: ClientIntent) {
    if (busy.current) return null;
    if (room?.phase !== "construindo") {
      setNotice(text("FORA_DE_FASE"));
      return null;
    }
    const current = readCred(clean);
    if (!current.seatToken || offline) return null;
    busy.current = true;
    try {
      const result = await sendIntent({
        data: {
          code: clean,
          seatToken: current.seatToken,
          baseRevision: lawRev.current,
          intent,
        },
      });
      adopt(result.room);
      setNotice(result.ok ? null : text(result.motivo));
      return result;
    } catch {
      setNotice("A sala não respondeu.");
      return null;
    } finally {
      busy.current = false;
    }
  }

  async function pick(id: string) {
    const result = await send({ type: "pegar", instanceId: id });
    if (result?.ok && result.room?.you) {
      setSelected(id);
      setPose(homePose(result.room.you.chair));
    }
  }

  async function commit(next: Pose) {
    if (!selected) return;
    setPose(next);
    const result = await send({ type: "encaixar", instanceId: selected, pose: next });
    if (result?.ok) setSelected(null);
  }

  async function detach(id: string) {
    const item = room?.law.instances.find((pieceItem) => pieceItem.id === id);
    if (!item || item.cadeira !== myChair) {
      setNotice(SALA_TEXTO.CONSTRUCAO_ALHEIA ?? "Essa construção é de outra cadeira.");
      return;
    }
    const result = await send({ type: "desmontar", instanceId: id });
    if (result?.ok && result.room?.you) {
      setSelected(id);
      setPose(homePose(result.room.you.chair));
    }
  }

  async function giveBack() {
    if (!selected) return;
    const result = await send({ type: "devolver", instanceId: selected });
    if (result?.ok) setSelected(null);
  }

  async function loan(run: () => Promise<{ ok: boolean; motivo: string | null; room: PublicRoom | null }>) {
    if (busy.current || offline) return;
    if (room?.phase !== "construindo") {
      setNotice(text("FORA_DE_FASE"));
      return;
    }
    const current = readCred(clean);
    if (!current.seatToken) return;
    busy.current = true;
    try {
      const result = await run();
      adopt(result.room);
      setNotice(result.ok ? null : text(result.motivo));
    } catch {
      setNotice("A sala não respondeu.");
    } finally {
      busy.current = false;
    }
  }

  async function ask() {
    const result = await requestSeat({ data: { code: clean, chair: chairPick } });
    if (!result.ok || !result.requestId || !result.requestSecret) {
      setNotice(text(result.motivo));
      return;
    }
    save({ requestId: result.requestId, requestSecret: result.requestSecret, chair: chairPick });
    setNotice(null);
  }

  async function answer(requestId: string, accept: boolean) {
    const current = readCred(clean);
    if (!current.hostSecret) return;
    const result = await answerSeat({
      data: { code: clean, hostSecret: current.hostSecret, requestId, accept },
    });
    adopt(result.room);
    if (!result.ok) setNotice(text(result.motivo));
  }

  async function begin() {
    const current = readCred(clean);
    if (!current.hostSecret) return;
    const result = await startSala({ data: { code: clean, hostSecret: current.hostSecret } });
    adopt(result.room);
    if (!result.ok) setNotice(text(result.motivo));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "q") setViewTurn((turn) => turn + Math.PI / 2);
      if (event.key === "e") setViewTurn((turn) => turn - Math.PI / 2);
      if (!inHand || !piece) return;
      if (event.key === "r" || event.key === "R") {
        setPose((current) => spinPiece(piece.defId, current, "horario"));
      }
      if (event.key === "ArrowLeft") setPose((current) => stepPose(current, viewTurn, "esquerda"));
      if (event.key === "ArrowRight") setPose((current) => stepPose(current, viewTurn, "direita"));
      if (event.key === "ArrowUp") setPose((current) => stepPose(current, viewTurn, "cima"));
      if (event.key === "ArrowDown") setPose((current) => stepPose(current, viewTurn, "baixo"));
      if (event.key === "[") setPose((current) => ({ ...current, y: current.y - 1 }));
      if (event.key === "]") setPose((current) => ({ ...current, y: current.y + 1 }));
      if (event.key === "Enter") void commit(pose);
      if (event.key === "Escape") void giveBack();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, giveBack, inHand, piece, pose, viewTurn]);

  if (!cred.seatToken && !cred.requestId) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-8">
        <p className="font-display text-3xl">LEGRO</p>
        <h1 className="font-display text-2xl">Pedir uma cadeira</h1>
        <p className="font-display text-3xl tracking-widest">{clean}</p>
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((chair) => (
            <button
              key={chair}
              type="button"
              className={chairPick === chair ? "lab-btn border-ink" : "lab-btn"}
              onClick={() => setChairPick(chair)}
            >
              {CADEIRA_NOME[chair]}
            </button>
          ))}
        </div>
        <button type="button" className="lab-btn bg-ink text-paper" onClick={() => void ask()}>
          Pedir esta cadeira
        </button>
        {notice ? <p className="text-sm text-no">{notice}</p> : null}
        <Link to="/" className="text-sm text-muted underline">
          Voltar
        </Link>
      </main>
    );
  }

  if (!cred.seatToken) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-3 px-4 py-8">
        <p className="font-display text-3xl">LEGRO</p>
        <h1 className="font-display text-2xl">Esperando o anfitrião</h1>
        <p className="text-muted">
          Pedido para a {CADEIRA_NOME[cred.chair ?? 0]}. A sala ainda não te sentou.
        </p>
        {notice ? <p className="text-sm text-no">{notice}</p> : null}
      </main>
    );
  }

  const building = room?.phase === "construindo" && !offline;

  return (
    <main className="flex h-dvh flex-col bg-paper text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="font-display text-xl leading-none">LEGRO</p>
          <p className="mt-1 text-sm text-muted">
            Sala {clean}
            {myChair != null ? ` · ${CADEIRA_NOME[myChair]}` : ""}
            {room?.you?.host ? " · anfitrião" : ""}
            {" · "}
            <a className="underline" href={`/comparar?salas=${clean}`}>
              Comparar
            </a>
          </p>
        </div>
        <p className="font-display text-2xl tabular-nums">
          {room ? (
            <Clock
              startedAt={room.startedAt}
              durationMs={room.durationMs}
              phase={room.phase}
              offsetRef={offsetRef}
            />
          ) : (
            "…"
          )}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[62dvh] flex-1 touch-none lg:min-h-0">
          {Scene && room ? (
            <Scene
              pieces={placed}
              ghost={ghost}
              yaw={pose.yaw}
              viewTurn={viewTurn}
              onAim={building ? setPose : () => undefined}
              onCommit={building ? (next) => void commit(next) : () => undefined}
              onDetach={building ? (id) => void detach(id) : () => undefined}
              tables={3}
              focus={focus}
              onInspectTurn={
                room.phase === "exposicao" ? (delta) => setViewTurn((turn) => turn + delta) : undefined
              }
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">Abrindo a sala…</div>
          )}
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
            <button type="button" className="lab-btn bg-dock" onClick={() => setViewTurn((turn) => turn + Math.PI / 2)}>
              <RotateCcw className="size-4" />
              {room?.phase === "exposicao" ? "Girar vista" : "Vista"}
            </button>
            {room?.phase === "exposicao" ? (
              <>
                <button
                  type="button"
                  className={inspecao === "todas" ? "lab-btn border-ink bg-dock" : "lab-btn bg-dock"}
                  onClick={() => setInspecao("todas")}
                >
                  As três
                </button>
                {([0, 1, 2] as const).map((chair) => (
                  <button
                    key={chair}
                    type="button"
                    className={inspecao === chair ? "lab-btn border-ink bg-dock" : "lab-btn bg-dock"}
                    onClick={() => setInspecao(chair)}
                  >
                    {CADEIRA_NOME[chair]}
                  </button>
                ))}
              </>
            ) : (
              <button
                type="button"
                className="lab-btn bg-dock"
                onClick={() => setInspecao((value) => (value === "todas" ? "minha" : "todas"))}
              >
                {inspecao === "todas" ? "Minha mesa" : "As três mesas"}
              </button>
            )}
          </div>
        </div>

        <aside className="flex max-h-96 w-full flex-col gap-3 overflow-y-auto border-t border-line bg-dock p-3 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
          {offline ? (
            <p className="rounded-2xl border border-line bg-paper p-3 text-sm">
              Esta tela parou. A sala continuou sem ela. Reconectar lê a versão atual e esquece o que estava só aqui.
            </p>
          ) : null}
          <section className="rounded-2xl border border-line bg-paper p-3" aria-live="polite">
            <p className="text-xs tracking-wide text-muted uppercase">Sala</p>
            <p className="mt-1 text-sm">Versão {room?.roomRevision ?? "…"}</p>
            {room?.phase === "espera" ? (
              <p className="mt-2 text-sm text-muted">O anfitrião ainda não começou os 30 minutos.</p>
            ) : null}
            {room?.phase === "exposicao" ? (
              <p className="mt-2 text-sm">
                A construção terminou. As três ficaram como estavam nesse instante. Girar a vista não move peça.
              </p>
            ) : null}
            {previa && piece ? (
              <>
                <p className="mt-2 font-medium">{CATALOG[piece.defId]?.nome}</p>
                <p className="text-sm text-muted">
                  x {pose.x} · y {pose.y} · z {pose.z} · {yawDegrees(pose.yaw)}°
                </p>
                <p className={previa.ok ? "mt-1 text-sm text-ok" : "mt-1 text-sm text-no"}>
                  {previa.ok ? "A lei aceita este encaixe." : text(previa.motivo)}
                </p>
                <p className="mt-1 text-xs text-muted">O fantasma ainda não entrou na sala.</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">A mesa que você vê é a última versão que a sala entregou.</p>
            )}
            {notice ? <p className="mt-3 border-t border-line pt-3 text-sm text-no">{notice}</p> : null}
          </section>

          {room?.report ? <Relatorio report={room.report} /> : null}

          {room?.you?.host && room.phase === "espera" ? (
            <button type="button" className="lab-btn bg-ink text-paper" onClick={() => void begin()}>
              Começar os 30 minutos
            </button>
          ) : null}

          {room?.you?.host && room.requests && room.requests.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-muted uppercase">Pedidos</h2>
              {room.requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-2">
                  <span className="text-sm">{CADEIRA_NOME[request.chair]}</span>
                  <span className="flex gap-2">
                    <button type="button" className="lab-btn" onClick={() => void answer(request.id, true)}>
                      Aceitar
                    </button>
                    <button type="button" className="lab-btn" onClick={() => void answer(request.id, false)}>
                      Recusar
                    </button>
                  </span>
                </div>
              ))}
            </section>
          ) : null}

          {room ? (
            <ul className="flex flex-col gap-1 text-sm">
              {room.seats.map((seat) => (
                <li key={seat.chair} className="flex items-center gap-2">
                  <span className={`size-3 rounded-full ${MARK[seat.chair]}`} />
                  {CADEIRA_NOME[seat.chair]} · {seat.occupied ? "ocupada" : seat.pending ? "pedido" : "livre"}
                  {room.you?.chair === seat.chair ? " · você" : ""}
                </li>
              ))}
            </ul>
          ) : null}

          {room?.phase === "exposicao" ? (
            <section>
              <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Na mão, no encerramento</h2>
              {([0, 1, 2] as const).every(
                (chair) => !room.law.instances.some((item) => item.holder === chair && item.pose === null),
              ) ? (
                <p className="text-sm text-muted">Nenhuma peça ficou na mão.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {([0, 1, 2] as const).map((chair) =>
                    room.law.instances
                      .filter((item) => item.holder === chair && item.pose === null)
                      .map((item) => (
                        <li key={item.id}>
                          {CADEIRA_NOME[chair]} · {CATALOG[item.defId]?.nome ?? item.defId} {item.cor} ({item.id})
                        </li>
                      )),
                  )}
                </ul>
              )}
            </section>
          ) : null}

          {room && room.law.log.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Construção</h2>
              <ol className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {room.law.log.map((event, index) => (
                  <li key={`${event.revision}-${event.tipo}-${event.instanceId}-${index}`} className="text-sm">
                    {textoDaLei(event)}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {inHand && piece ? (
            <section className="sticky top-0 z-10 -mx-3 flex flex-col gap-2 bg-dock px-3 py-2">
              <MovePad
                onNudge={(which) => setPose((current) => stepPose(current, viewTurn, which))}
                onSpin={(sentido) => setPose((current) => spinPiece(piece.defId, current, sentido))}
                onLift={(dir) => setPose((current) => ({ ...current, y: current.y + dir }))}
              />
              <button type="button" className="lab-btn bg-ink text-paper" onClick={() => void commit(pose)}>
                Soltar peça
              </button>
              <button type="button" className="lab-btn" onClick={() => void giveBack()}>
                <Undo2 className="size-4" />
                Devolver à mesa
              </button>
              {selected && borrowed.some((item) => item.pieceId === selected) ? (
                <button
                  type="button"
                  className="lab-btn"
                  onClick={() => {
                    const id = selected;
                    void loan(async () => {
                      const current = readCred(clean);
                      const result = await returnLoan({
                        data: { code: clean, seatToken: current.seatToken ?? "", pieceId: id },
                      });
                      if (result.ok) setSelected(null);
                      return result;
                    });
                  }}
                >
                  Devolver a quem emprestou
                </button>
              ) : null}
            </section>
          ) : room?.phase === "exposicao" ? null : (
            <p className="text-sm text-muted">
              {building
                ? "Pegue na bandeja, ou peça uma peça que esteja na mão de outra cadeira."
                : "Fora da construção, a sala não aceita encaixe."}
            </p>
          )}

          {room?.phase !== "exposicao" && hand.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Na mão</h2>
              <div className="flex flex-col gap-2">
                {hand.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === selected ? "lab-btn border-ink" : "lab-btn"}
                    onClick={() => setSelected(item.id)}
                  >
                    <PieceGlyph defId={item.defId} cor={item.cor} />
                    {CATALOG[item.defId]?.nome}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {building && incoming.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-muted uppercase">Pedidos de peça</h2>
              {incoming.map((item) => (
                <div key={item.id} className="rounded-2xl border border-line bg-paper p-2">
                  <p className="text-sm">
                    {CADEIRA_NOME[item.to]} pediu {CATALOG[item.defId]?.nome ?? item.defId} {item.cor} ({item.pieceId})
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="lab-btn"
                      disabled={!building}
                      onClick={() =>
                        void loan(async () => {
                          const current = readCred(clean);
                          return answerLoan({
                            data: {
                              code: clean,
                              seatToken: current.seatToken ?? "",
                              loanId: item.id,
                              accept: true,
                            },
                          });
                        })
                      }
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      className="lab-btn"
                      disabled={!building}
                      onClick={() =>
                        void loan(async () => {
                          const current = readCred(clean);
                          return answerLoan({
                            data: {
                              code: clean,
                              seatToken: current.seatToken ?? "",
                              loanId: item.id,
                              accept: false,
                            },
                          });
                        })
                      }
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {building && outgoing.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h2 className="text-xs tracking-wide text-muted uppercase">Você pediu</h2>
              {outgoing.map((item) => (
                <p key={item.id} className="text-sm text-muted">
                  {CATALOG[item.defId]?.nome ?? item.defId} ({item.pieceId}), que está com {CADEIRA_NOME[item.from]}.
                </p>
              ))}
            </section>
          ) : null}

          {building && others.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Na mão das outras</h2>
              <div className="flex flex-col gap-2">
                {others.map((item) => {
                  const pending = loans.some((loanItem) => loanItem.pieceId === item.id && loanItem.status === "pendente");
                  const holder = item.holder;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="lab-btn justify-between"
                      disabled={!building || pending || typeof holder !== "number"}
                      onClick={() => {
                        if (typeof holder !== "number") return;
                        void loan(async () => {
                          const current = readCred(clean);
                          return askLoan({
                            data: {
                              code: clean,
                              seatToken: current.seatToken ?? "",
                              pieceId: item.id,
                              expectedHolder: holder,
                            },
                          });
                        });
                      }}
                    >
                      <span className="flex items-center gap-2 text-left">
                        <PieceGlyph defId={item.defId} cor={item.cor} size={40} />
                        <span>
                          {CATALOG[item.defId]?.nome}
                          <span className="block text-muted">{CADEIRA_NOME[holder as 0 | 1 | 2]}</span>
                        </span>
                      </span>
                      <span className="text-muted">{pending ? "pedido" : "Pedir"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {building && borrowed.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs tracking-wide text-muted uppercase">Emprestadas a você</h2>
              {borrowed.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="lab-btn justify-between"
                  disabled={!building}
                  onClick={() =>
                    void loan(async () => {
                      const current = readCred(clean);
                      return returnLoan({
                        data: { code: clean, seatToken: current.seatToken ?? "", pieceId: item.pieceId },
                      });
                    })
                  }
                >
                  <span>
                    {CATALOG[item.defId]?.nome} ({item.pieceId})
                  </span>
                  <span className="text-muted">Devolver a {CADEIRA_NOME[item.from]}</span>
                </button>
              ))}
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Histórico</h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted">Ainda não há empréstimo.</p>
            ) : (
              <ol className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {history.map((fact, index) => (
                  <li key={`${fact.loanId}-${fact.type}-${index}`} className="text-sm">
                    <p>{textoDoFato(fact)}</p>
                    <p className="text-xs text-muted">Versão {fact.roomRevision}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {room?.phase !== "exposicao" ? (
          <section>
            <h2 className="mb-2 text-xs tracking-wide text-muted uppercase">Bandeja</h2>
            <div className="flex flex-col gap-2">
              {tray.map((item) => (
                <button
                  key={`${item.defId}:${item.cores[0]}`}
                  type="button"
                  className="lab-btn h-auto justify-between py-2"
                  disabled={!building}
                  onClick={() => void pick(item.sampleId)}
                >
                  <span className="flex items-center gap-3">
                    <PieceGlyph defId={item.defId} cor={item.cores[0] ?? "cinza"} size={56} />
                    <span className="text-left">
                      {item.nome}
                      <span className="block text-xs text-muted">{item.cores[0]}</span>
                    </span>
                  </span>
                  <span className="text-muted">{item.count}</span>
                </button>
              ))}
            </div>
          </section>
          ) : null}

          <div className="flex gap-2">
            {offline ? (
              <button type="button" className="lab-btn" onClick={() => setOffline(false)}>
                Reconectar
              </button>
            ) : (
              <button type="button" className="lab-btn" onClick={() => setOffline(true)}>
                Desconectar
              </button>
            )}
            <Link to="/" className="lab-btn">
              Início
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

type ChairFacts = MatchReport["cadeiras"][number];
type ChairNumberKey = {
  [K in keyof ChairFacts]: ChairFacts[K] extends number ? K : never;
}[keyof ChairFacts];

const LINHAS: { key: ChairNumberKey; label: string }[] = [
  { key: "pecasNaConstrucao", label: "Peças na construção" },
  { key: "tiposDiferentes", label: "Tipos diferentes" },
  { key: "conexoes", label: "Conexões" },
  { key: "profundidadeMaxima", label: "Profundidade a partir da base" },
  { key: "pecasReutilizadas", label: "Peças reutilizadas" },
  { key: "desmontagens", label: "Desmontagens" },
  { key: "emprestimosRealizados", label: "Empréstimos feitos" },
  { key: "emprestimosRecebidos", label: "Empréstimos recebidos" },
  { key: "pedidosRealizados", label: "Pedidos feitos" },
  { key: "pedidosRecusados", label: "Pedidos recusados" },
  { key: "pecasDevolvidasAMesa", label: "Devolvidas à mesa" },
  { key: "pecasDevolvidasAoDono", label: "Devolvidas a quem emprestou" },
  { key: "pecasNaMao", label: "Ainda na mão" },
  { key: "eventosRelevantes", label: "Eventos" },
];

function Relatorio({ report }: { report: MatchReport }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs tracking-wide text-muted uppercase">Relatório</h2>
      <p className="text-sm text-muted">Só o que aconteceu. Sem nota e sem vencedor.</p>
      {report.pedidosEncerradosSemResposta.length > 0 ? (
        <p className="text-sm">
          Pedidos encerrados sem resposta: {report.pedidosEncerradosSemResposta.join(", ")}. A posse não mudou.
        </p>
      ) : null}
      {report.cadeiras.map((chair) => (
        <article key={chair.chair} className="rounded-2xl border border-line bg-paper p-3">
          <h3 className="font-display text-lg">{CADEIRA_NOME[chair.chair]}</h3>
          <p className="mt-1 text-sm text-muted">
            Famílias: {chair.familias.length > 0 ? chair.familias.join(", ") : "nenhuma"}
          </p>
          {chair.pecas.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {chair.pecas.map((item) => (
                <li key={item.id}>
                  {CATALOG[item.defId]?.nome ?? item.defId} {item.cor} ({item.id}) · profundidade{" "}
                  {item.profundidade ?? "sem base"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nenhuma peça encaixada.</p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {LINHAS.map((line) => (
              <div key={line.key} className="contents">
                <dt className="text-muted">{line.label}</dt>
                <dd className="text-right tabular-nums">{chair[line.key]}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}
