import type { AccountResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

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
    <li key={account.id}>
      <b>{account.profile.name}</b>
      <span class="muted"> · {account.playerId ?? 'sem Player ID'} · {account.email}</span>
      <button type="button" class="link" disabled={busy} onClick={() => { toggle(account); }}>
        {account.judge ? 'Tirar da equipe' : 'Marcar como juiz'}
      </button>
    </li>
  );

  return (
    <section class="card">
      <h2>Equipe</h2>
      <form onSubmit={search}>
        <label for="team-query">Buscar por nome ou Player ID</label>
        <input id="team-query" required minLength={2} value={query} onInput={(e) => { setQuery(e.currentTarget.value); }} />
        <button type="submit" disabled={busy}>Buscar</button>
      </form>
      {results && (results.length === 0 ? <p class="muted">Nenhuma conta encontrada.</p> : <ul class="list">{results.map(row)}</ul>)}
      <h2>Juízes da equipe</h2>
      {judges.length === 0 ? <p class="muted">Nenhum juiz na equipe.</p> : <ul class="list">{judges.map(row)}</ul>}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
