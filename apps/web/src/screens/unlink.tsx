import type { AccountResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { box, Feedback, field, ghost } from '../ui.js';

/** ADM desfaz um vínculo errado: o Player ID sai da conta e o dono verdadeiro pode cadastrá-lo. */
export const UnlinkCard = ({ api }: { api: Api }) => {
  const [playerId, setPlayerId] = useState('');
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await action(); } catch (e) { setMessage({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };

  const lookup = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.accountByPlayerId(playerId.trim());
      setAccount(result.ok ? result.body : null);
      if (!result.ok) setMessage({ ok: false, text: result.error.message });
    });
  };

  const unlink = () => {
    const pid = account?.playerId;
    if (!account || !pid) return;
    if (!confirm(`Tirar o Player ID ${pid} de ${account.profile.name}? A pessoa precisará informar outro Player ID.`)) return;
    void run(async () => {
      const result = await api.unlinkPlayerId(pid);
      if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
      setAccount(null);
      setMessage({ ok: true, text: 'Vínculo desfeito. O dono do Player ID já pode cadastrá-lo.' });
    });
  };

  return (
    <section class={`${box} max-w-xl`} aria-label="Desfazer vínculo de Player ID">
      <h2 class="m-0 text-sm font-bold">Desfazer vínculo de Player ID</h2>
      <p class="m-0 text-sm text-muted">Use quando alguém cadastrou o Player ID de outra pessoa.</p>
      <form class="m-0 flex gap-2" onSubmit={lookup}>
        <input class={field} aria-label="Player ID" placeholder="Player ID" inputmode="numeric" required value={playerId}
          onInput={(e) => { setPlayerId(e.currentTarget.value); }} />
        <button type="submit" class={ghost} disabled={busy}>Buscar</button>
      </form>
      {account && (
        <div class="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-sm">
          <div><div class="font-semibold">{account.profile.name}</div><div class="text-muted">{account.email}</div></div>
          <button type="button" class={`${ghost} text-error`} disabled={busy} onClick={unlink}>Desfazer vínculo</button>
        </div>
      )}
      <Feedback message={message} />
    </section>
  );
};
