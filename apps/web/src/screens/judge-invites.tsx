import type { InviteDto } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { Qr } from '../tv/qr.js';
import { box, Feedback, ghost, linkButton, primary } from '../ui.js';

/** Os minutos restantes avançam sozinhos; a lista confere o servidor de tempos em tempos. */
const TICK_MS = 30_000;

const inviteUrl = (code: string) => `${location.origin}/juiz/${code}`;
const minutesLeft = (expiresAt: string, now: number) => Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));

/**
 * Convite de juiz: QR mostrado só aqui, no painel (nunca na TV). Vale 15 minutos e uma única vez; quem escaneia
 * entra ou se cadastra e vira juiz da equipe.
 */
export const JudgeInvites = ({ api }: { api: Api }) => {
  const [open, setOpen] = useState<InviteDto[]>([]);
  const [shown, setShown] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const result = await api.openInvites();
    if (result.ok) setOpen(result.body); else setMessage({ ok: false, text: result.error.message });
  };

  useEffect(() => {
    void load().catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); });
    const timer = setInterval(() => { setNow(Date.now()); void load().catch(() => undefined); }, TICK_MS);
    return () => { clearInterval(timer); };
  }, [api]);

  const act = (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    void action()
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); setNow(Date.now()); });
  };

  const create = () => {
    act(async () => {
      const result = await api.createInvite();
      if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
      setShown(result.body.code);
      await load();
    });
  };

  const cancel = (code: string) => {
    act(async () => {
      const result = await api.cancelInvite(code);
      if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
      if (shown === code) setShown(null);
      await load();
    });
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(inviteUrl(code)).then(
      () => { setMessage({ ok: true, text: 'Link copiado.' }); },
      () => { setMessage({ ok: false, text: 'Não foi possível copiar; selecione e copie manualmente.' }); },
    );
  };

  return (
    <section class={box} aria-label="Convite de juiz">
      <h2 class="m-0 text-sm font-bold">Convite de juiz</h2>
      <p class="m-0 text-sm text-muted">O QR vale 15 minutos e uma única vez. Mostre só para a pessoa: ele nunca vai para a TV.</p>
      <button type="button" class={`${primary} self-start`} disabled={busy} onClick={create}>Gerar convite de juiz</button>
      {shown && open.some((i) => i.code === shown) && (
        <div class="flex flex-col items-center gap-2">
          <Qr url={inviteUrl(shown)} class="h-48" />
          <button type="button" class={linkButton} onClick={() => { copy(shown); }}>{inviteUrl(shown)}</button>
        </div>
      )}
      {open.length > 0 && (
        <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {open.map((i) => (
            <li key={i.code} class="flex items-center justify-between gap-2 border-b border-line py-1">
              <button type="button" class={`${linkButton} font-mono`} onClick={() => { setShown(i.code); }}>{i.code}</button>
              <span class="text-muted">vence em {minutesLeft(i.expiresAt, now)} min</span>
              <button type="button" class={`${ghost} px-2 py-1 text-xs text-error`} disabled={busy} onClick={() => { cancel(i.code); }}>Cancelar</button>
            </li>
          ))}
        </ul>
      )}
      <Feedback message={message} />
    </section>
  );
};
