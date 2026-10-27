import { displayName, type AccountResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { box, Feedback, field, ghost, linkButton } from '../ui.js';

/** Equipe do ADM: busca a conta por nome ou Player ID e marca ou tira o juiz. */
export const TeamCard = ({ api }: { api: Api }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AccountResponse[] | null>(null);
  const [judges, setJudges] = useState<AccountResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const loadJudges = async () => {
    const result = await api.judges();
    if (result.ok) setJudges(result.body);
    else setError(result.error.message);
  };

  useEffect(() => { void run(loadJudges); }, []);

  const search = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.searchAccounts(query.trim());
      if (result.ok) setResults(result.body);
      else { setResults(null); setError(result.error.message); }
    });
  };

  const toggle = (account: AccountResponse) => {
    void run(async () => {
      const result = await api.setJudge(account.id, !account.judge);
      if (!result.ok) { setError(result.error.message); return; }
      setResults((list) => list?.map((a) => (a.id === account.id ? result.body : a)) ?? null);
      await loadJudges();
    });
  };

  const row = (account: AccountResponse) => (
    <tr key={account.id} class="border-b border-line">
      <td class="py-2 pr-2 font-semibold">{displayName(account.profile)}</td>
      <td class="py-2 pr-2 text-muted">{account.playerId ?? 'sem Player ID'}</td>
      <td class="py-2 pr-2 text-muted">{account.email}</td>
      <td class="py-2 text-right">
        <button type="button" class={linkButton} disabled={busy} onClick={() => { toggle(account); }}>
          {account.judge ? 'Tirar da equipe' : 'Marcar como juiz'}
        </button>
      </td>
    </tr>
  );

  return (
    <div class="grid min-h-0 flex-1 grid-cols-2 gap-4">
      <section class={box} aria-label="Buscar conta">
        <h2 class="m-0 text-sm font-bold">Buscar conta</h2>
        <form class="m-0 flex gap-2" onSubmit={search}>
          <input class={field} aria-label="Buscar por nome ou Player ID" placeholder="Nome ou Player ID" required minLength={2}
            value={query} onInput={(e) => { setQuery(e.currentTarget.value); }} />
          <button type="submit" class={ghost} disabled={busy}>Buscar</button>
        </form>
        <div class="min-h-0 overflow-y-auto">
          {results && (results.length === 0
            ? <p class="m-0 text-sm text-muted">Nenhuma conta encontrada.</p>
            : <table class="w-full border-collapse text-sm"><tbody>{results.map(row)}</tbody></table>)}
        </div>
      </section>
      <section class={box} aria-label="Juízes da equipe">
        <h2 class="m-0 text-sm font-bold">Juízes da equipe</h2>
        <div class="min-h-0 overflow-y-auto">
          {judges.length === 0
            ? <p class="m-0 text-sm text-muted">Nenhum juiz na equipe.</p>
            : <table class="w-full border-collapse text-sm"><tbody>{judges.map(row)}</tbody></table>}
        </div>
        <Feedback message={error ? { ok: false, text: error } : null} />
      </section>
    </div>
  );
};
