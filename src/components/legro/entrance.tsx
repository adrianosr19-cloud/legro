import { CADEIRA_NOME, SALA_TEXTO } from "@/legro/room-copy";
import { writeCred } from "@/legro/room-cred";
import { createSala, requestSeat } from "@/legro/room-fns";
import type { Chair } from "@/legro/types";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

const CHAIRS: Chair[] = [0, 1, 2];

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function Entrance() {
  const navigate = useNavigate();
  const [hostChair, setHostChair] = useState<Chair>(0);
  const [guestChair, setGuestChair] = useState<Chair>(1);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await createSala({ data: { chair: hostChair } });
      if (!result.ok || !result.room || !result.seatToken || !result.hostSecret) {
        setError(SALA_TEXTO[result.motivo ?? ""] ?? "Não deu para abrir a sala.");
        return;
      }
      writeCred(result.room.code, {
        seatToken: result.seatToken,
        hostSecret: result.hostSecret,
        chair: hostChair,
      });
      await navigate({ to: "/sala/$code", params: { code: result.room.code } });
    } catch {
      setError("Não deu para abrir a sala.");
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    const clean = normalizeCode(code);
    if (clean.length !== 8) {
      setError("O código da sala tem 8 letras.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestSeat({ data: { code: clean, chair: guestChair } });
      if (!result.ok || !result.requestId || !result.requestSecret) {
        setError(SALA_TEXTO[result.motivo ?? ""] ?? "Não deu para pedir a cadeira.");
        return;
      }
      writeCred(clean, {
        requestId: result.requestId,
        requestSecret: result.requestSecret,
        chair: guestChair,
      });
      await navigate({ to: "/sala/$code", params: { code: clean } });
    } catch {
      setError("Não deu para pedir a cadeira.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-8">
      <header>
        <p className="font-display text-4xl">LEGRO</p>
        <p className="mt-2 max-w-xl text-muted">
          Três cadeiras, uma sala. O código é o convite. As telas não guardam a mesa — elas perguntam à sala.
        </p>
      </header>

      <section className="rounded-3xl border border-line bg-dock p-4">
        <h1 className="font-display text-2xl">Abrir uma sala</h1>
        <p className="mt-1 text-sm text-muted">Você é o anfitrião e já senta numa cadeira.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {CHAIRS.map((chair) => (
            <button
              key={chair}
              type="button"
              className={hostChair === chair ? "lab-btn border-ink" : "lab-btn"}
              onClick={() => setHostChair(chair)}
            >
              {CADEIRA_NOME[chair]}
            </button>
          ))}
        </div>
        <button type="button" className="lab-btn mt-4 bg-ink text-paper" disabled={busy} onClick={() => void create()}>
          Criar sala
        </button>
      </section>

      <section className="rounded-3xl border border-line bg-dock p-4">
        <h2 className="font-display text-2xl">Entrar com código</h2>
        <label className="mt-4 block text-sm text-muted" htmlFor="codigo">
          Código da sala
        </label>
        <input
          id="codigo"
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-3 font-display text-2xl tracking-widest uppercase"
        />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {CHAIRS.map((chair) => (
            <button
              key={chair}
              type="button"
              className={guestChair === chair ? "lab-btn border-ink" : "lab-btn"}
              onClick={() => setGuestChair(chair)}
            >
              {CADEIRA_NOME[chair]}
            </button>
          ))}
        </div>
        <button type="button" className="lab-btn mt-4 bg-ink text-paper" disabled={busy} onClick={() => void ask()}>
          Pedir esta cadeira
        </button>
      </section>

      {error ? <p className="text-sm text-no">{error}</p> : null}

      <p className="text-sm text-muted">
        Cada criança monta o próprio projeto na sala em que sentou.{" "}
        <a className="underline" href="/comparar">
          Comparar trabalhos
        </a>
        . A mesa de ensaio, de uma cadeira só, continua em separado.{" "}
        <a className="underline" href="/laboratorio">
          Abrir a mesa de ensaio
        </a>
      </p>
    </main>
  );
}
