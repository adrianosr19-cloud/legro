import { BASE_ORIGINS, CATALOG } from "@/legro/catalog";
import { mergeCodes, normalizeRoomCode, validRoomCode } from "@/legro/compare";
import { STUD } from "@/legro/lab-bridge";
import { CADEIRA_NOME } from "@/legro/room-copy";
import { readSala } from "@/legro/room-fns";
import type { ChairReport, MatchReport } from "@/legro/report";
import type { PublicRoom } from "@/legro/room-service";
import type { Chair } from "@/legro/types";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ScenePiece } from "./table-scene";

const STORE = "legro-comparar-v1";
const LIMIT = 6;

type FactKey = {
  [K in keyof ChairReport]: ChairReport[K] extends number ? K : never;
}[keyof ChairReport];

const FATOS: { key: FactKey; label: string }[] = [
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

type Loaded = PublicRoom | "ausente";
type Look = { code: string; chair: Chair | "todas" };

function codesFromPage(): string[] {
  if (typeof window === "undefined") return [];
  const params = new URLSearchParams(window.location.search).get("salas") ?? "";
  const fromUrl = params.split(",").map(normalizeRoomCode).filter(validRoomCode);
  let stored: string[] = [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE) ?? "[]") as unknown;
    if (Array.isArray(raw)) stored = raw.filter((item): item is string => typeof item === "string");
  } catch {
    stored = [];
  }
  return mergeCodes(fromUrl, stored, LIMIT);
}

function remember(codes: string[]) {
  window.localStorage.setItem(STORE, JSON.stringify(codes));
  const url = new URL(window.location.href);
  if (codes.length > 0) url.searchParams.set("salas", codes.join(","));
  else url.searchParams.delete("salas");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function placedOf(room: PublicRoom): ScenePiece[] {
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
}

function focusFor(chair: Chair | "todas", narrow: boolean) {
  if (chair !== "todas") {
    const origin = BASE_ORIGINS[chair];
    return { cx: (origin.x + 4) * STUD, cz: (origin.z + 4) * STUD, radius: 2.2, height: 1.35, fov: 40 };
  }
  if (narrow) return { cx: 20 * STUD, cz: 4 * STUD, radius: 17.2, height: 12.4, fov: 54 };
  return { cx: 20 * STUD, cz: 4 * STUD, radius: 12.6, height: 8.4, fov: 48 };
}

export function CompareSession() {
  const [codes, setCodes] = useState<string[]>(codesFromPage);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Record<string, Loaded>>({});
  const [look, setLook] = useState<Look | null>(null);
  const [viewTurn, setViewTurn] = useState(0.4);
  const [narrow, setNarrow] = useState(false);
  const [Scene, setScene] = useState<typeof import("./table-scene").TableScene | null>(null);

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
    let stop = false;
    async function pull() {
      if (codes.length === 0) {
        setRooms({});
        return;
      }
      const rows = await Promise.all(
        codes.map(async (code) => {
          const result = await readSala({ data: { code, seatToken: null, hostSecret: null } });
          const loaded: Loaded = result.ok && result.room ? result.room : "ausente";
          return [code, loaded] as const;
        }),
      );
      if (stop) return;
      setRooms(Object.fromEntries(rows));
    }
    void pull().catch(() => setNotice("A comparação não conseguiu ler as salas."));
    const id = window.setInterval(() => {
      void pull().catch(() => setNotice("A comparação não conseguiu ler as salas."));
    }, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [codes]);

  const closed = codes.filter((code) => {
    const room = rooms[code];
    return !!room && room !== "ausente" && room.phase === "exposicao" && room.report;
  });
  const active = look && closed.includes(look.code) ? look : closed[0] ? { code: closed[0], chair: "todas" as const } : null;
  const shown = active ? rooms[active.code] : null;
  const room = shown && shown !== "ausente" ? shown : null;
  const pieces = room ? placedOf(room) : [];
  const focus = useMemo(() => focusFor(active?.chair ?? "todas", narrow), [active, narrow]);

  function add(raw: string) {
    const code = normalizeRoomCode(raw);
    if (!validRoomCode(code)) {
      setNotice("O código da sala tem 8 letras.");
      return;
    }
    if (codes.includes(code)) {
      setNotice("Essa sala já está na comparação.");
      setDraft("");
      return;
    }
    if (codes.length >= LIMIT) {
      setNotice("Dá para comparar seis salas de cada vez.");
      return;
    }
    const next = mergeCodes(codes, [code], LIMIT);
    setCodes(next);
    remember(next);
    setDraft("");
    setNotice(null);
    setLook({ code, chair: "todas" });
  }

  function remove(code: string) {
    const next = codes.filter((item) => item !== code);
    setCodes(next);
    remember(next);
    if (look?.code === code) setLook(null);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl leading-none">LEGRO</p>
          <h1 className="mt-2 font-display text-2xl">Comparar trabalhos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Cada criança monta o próprio projeto na sala em que sentou. Aqui os trabalhos ficam lado a lado, na ordem
            em que as salas foram trazidas. Não há nota e não há primeiro lugar.
          </p>
        </div>
        <Link to="/" className="lab-btn">
          Início
        </Link>
      </header>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          add(draft);
        }}
      >
        <label className="sr-only" htmlFor="sala-comparar">
          Código da sala
        </label>
        <input
          id="sala-comparar"
          value={draft}
          onChange={(event) => setDraft(normalizeRoomCode(event.target.value))}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Código da sala"
          className="min-h-11 w-full rounded-xl border border-line bg-paper px-3 font-display text-2xl tracking-widest uppercase sm:max-w-xs"
        />
        <button type="submit" className="lab-btn bg-ink text-paper">
          Trazer sala
        </button>
      </form>
      {notice ? <p className="text-sm text-no">{notice}</p> : null}

      <section className="relative h-80 overflow-hidden rounded-3xl border border-line bg-dock">
        {Scene && room && active ? (
          <Scene
            pieces={pieces}
            ghost={null}
            yaw={0}
            viewTurn={viewTurn}
            onAim={() => undefined}
            onCommit={() => undefined}
            onDetach={() => undefined}
            tables={3}
            focus={focus}
            onInspectTurn={(delta) => setViewTurn((turn) => turn + delta)}
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
            {codes.length === 0
              ? "Traga o código de uma sala encerrada para olhar o projeto."
              : "Quando o tempo da sala acaba, o trabalho entra aqui. Girar a vista não muda a peça."}
          </div>
        )}
        {room && active ? (
          <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
            <button type="button" className="lab-btn bg-dock" onClick={() => setViewTurn((turn) => turn + Math.PI / 2)}>
              <RotateCcw className="size-4" />
              Girar vista
            </button>
            <button
              type="button"
              className={active.chair === "todas" ? "lab-btn border-ink bg-dock" : "lab-btn bg-dock"}
              onClick={() => setLook({ code: active.code, chair: "todas" })}
            >
              As três
            </button>
            {([0, 1, 2] as const).map((chair) => (
              <button
                key={chair}
                type="button"
                className={active.chair === chair ? "lab-btn border-ink bg-dock" : "lab-btn bg-dock"}
                onClick={() => setLook({ code: active.code, chair })}
              >
                {CADEIRA_NOME[chair]}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {codes.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma sala nesta comparação.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">A ordem abaixo é a ordem em que as salas chegaram. Não é um ranking.</p>
          {codes.map((code) => {
            const item = rooms[code];
            const report: MatchReport | null = item && item !== "ausente" ? item.report : null;
            return (
              <article key={code} className="rounded-3xl border border-line bg-dock p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl tracking-widest">{code}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {!item ? "Lendo a sala…" : item === "ausente" ? "Não existe sala com esse código." : item.phase === "exposicao" ? "Trabalho encerrado. A peça ficou onde estava." : "Ainda em montagem. O projeto entra na comparação quando o tempo acaba."}
                    </p>
                  </div>
                  <button type="button" className="lab-btn" onClick={() => remove(code)}>
                    Tirar
                  </button>
                </div>
                {report ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {report.cadeiras.map((chair) => {
                      const selected = active?.code === code && (active.chair === "todas" || active.chair === chair.chair);
                      return (
                        <div
                          key={chair.chair}
                          className={
                            selected
                              ? "flex flex-col gap-2 rounded-2xl border border-ink bg-paper p-3 text-left"
                              : "flex flex-col gap-2 rounded-2xl border border-line bg-paper p-3 text-left"
                          }
                        >
                          <button
                            type="button"
                            className="flex flex-col gap-1 text-left"
                            onClick={() => setLook({ code, chair: chair.chair })}
                          >
                            <span className="font-display text-xl">{CADEIRA_NOME[chair.chair]}</span>
                            <span className="text-sm text-muted">
                              Projeto desta cadeira. Famílias:{" "}
                              {chair.familias.length > 0 ? chair.familias.join(", ") : "nenhuma"}
                            </span>
                            <span className="text-sm tabular-nums">
                              {chair.pecasNaConstrucao} {chair.pecasNaConstrucao === 1 ? "peça" : "peças"} na construção
                            </span>
                          </button>
                          <details className="text-sm">
                            <summary className="cursor-pointer text-muted">Fatos</summary>
                            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                              {FATOS.map((line) => (
                                <div key={line.key} className="contents">
                                  <dt className="text-muted">{line.label}</dt>
                                  <dd className="text-right tabular-nums">{chair[line.key]}</dd>
                                </div>
                              ))}
                            </dl>
                            {chair.pecas.length > 0 ? (
                              <ul className="mt-2 flex flex-col gap-1">
                                {chair.pecas.map((piece) => (
                                  <li key={piece.id}>
                                    {CATALOG[piece.defId]?.nome ?? piece.defId} {piece.cor} ({piece.id})
                                    {piece.profundidade != null ? ` · profundidade ${piece.profundidade}` : ""}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-muted">Nenhuma peça encaixada.</p>
                            )}
                          </details>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
