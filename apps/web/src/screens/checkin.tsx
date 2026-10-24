import type { AccountResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** Check-in do ADM: confere presencialmente o Player ID informado pelo jogador e confirma (ou corrige). */
export const Checkin = ({ api }: { api: Api }) => {
  const [code, setCode] = useState('');
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [playerId, setPlayerId] = useState('');
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
      const result = await api.account(code.trim());
      if (!result.ok) { setAccount(null); setMessage({ ok: false, text: result.error.message }); return; }
      setAccount(result.body);
      setPlayerId(result.body.playerId?.value ?? '');
    });
  };

  const confirm = (e: Event) => {
    e.preventDefault();
    if (!account) return;
    void run(async () => {
      const result = await api.confirmPlayerId(account.id, playerId.trim());
      if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
      setAccount(result.body);
      setMessage({ ok: true, text: `Player ID ${result.body.playerId?.value ?? ''} confirmado para ${result.body.profile.name}.` });
    });
  };

  return (
    <section class="card">
      <h2>Check-in</h2>
      <form onSubmit={lookup}>
        <label for="account-code">Código da conta (aparece na tela do jogador)</label>
        <input id="account-code" required value={code} onInput={(e) => { setCode(e.currentTarget.value); }} />
        <button type="submit" disabled={busy}>Consultar</button>
      </form>
      {account && (
        <form onSubmit={confirm}>
          <dl>
            <dt>Nome</dt><dd>{account.profile.name}</dd>
            <dt>E-mail</dt><dd>{account.email}</dd>
            <dt>Nascimento</dt><dd>{account.profile.birthYear}</dd>
            <dt>Player ID informado</dt>
            <dd>{account.playerId ? `${account.playerId.value} ${account.playerId.confirmed ? '(confirmado)' : '(pendente)'}` : 'não informado'}</dd>
          </dl>
          <label for="checked-pid">Player ID conferido no documento da Pokémon</label>
          <input id="checked-pid" inputmode="numeric" required value={playerId} onInput={(e) => { setPlayerId(e.currentTarget.value); }} />
          <button type="submit" disabled={busy}>Confirmar Player ID</button>
        </form>
      )}
      {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
};
