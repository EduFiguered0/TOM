import type { AccountResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';

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
    <section class="card">
      <h2>Desfazer vínculo de Player ID</h2>
      <form onSubmit={lookup}>
        <p class="muted">Use quando alguém cadastrou o Player ID de outra pessoa.</p>
        <label for="unlink-pid">Player ID</label>
        <input id="unlink-pid" inputmode="numeric" required value={playerId} onInput={(e) => { setPlayerId(e.currentTarget.value); }} />
        <button type="submit" disabled={busy}>Buscar</button>
      </form>
      {account && (
        <div>
          <dl>
            <dt>Nome</dt><dd>{account.profile.name}</dd>
            <dt>E-mail</dt><dd>{account.email}</dd>
          </dl>
          <button type="button" disabled={busy} onClick={unlink}>Desfazer vínculo</button>
        </div>
      )}
      {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
};
