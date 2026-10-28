import type { EditPlayerRequest, MeResponse, PlayerDetailDto, PlayerFieldDto } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { card, Feedback, field, ghost, label, primary } from '../ui.js';

/** Formulário do ADM: tudo em texto, como o usuário digitou. */
export interface PlayerEditForm {
  firstName: string;
  lastName: string;
  birthYear: string;
  phone: string;
  playerId: string;
}

/** Telefone vazio mantém o atual (o ADM só vê o mascarado); Player ID vazio desfaz o vínculo. */
export const editRequest = (form: PlayerEditForm): EditPlayerRequest => ({
  firstName: form.firstName,
  lastName: form.lastName,
  birthYear: Number(form.birthYear),
  ...(form.phone.trim() ? { phone: form.phone } : {}),
  playerId: form.playerId.trim() || null,
});

const FIELD_NAMES: Record<PlayerFieldDto, string> = {
  firstName: 'nome', lastName: 'sobrenome', birthYear: 'ano de nascimento', phone: 'telefone', playerId: 'Player ID',
};
const ORDER: readonly PlayerFieldDto[] = ['firstName', 'lastName', 'birthYear', 'phone', 'playerId'];

/** Aviso ao jogador, com os campos na ordem do formulário. */
export const adminChangesText = (fields: readonly PlayerFieldDto[]): string => {
  const names = ORDER.filter((f) => fields.includes(f)).map((f) => FIELD_NAMES[f]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}` : (names[0] ?? '');
  return `O ADM da loja alterou seus dados: ${list}.`;
};

/** Só informa: o jogador dá OK e o aviso some. */
export const AdminChangesCard = ({ me, api, onSeen }: { me: MeResponse; api: Api; onSeen: (me: MeResponse) => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = () => {
    setBusy(true);
    setError(null);
    void api.dismissAdminChanges()
      .then((result) => { if (result.ok) onSeen(result.body); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };
  return (
    <section class={`${card} border-accent`} role="status">
      <p class="m-0 font-medium">{adminChangesText(me.adminChanges)}</p>
      <button type="button" class={`${primary} self-start`} disabled={busy} onClick={seen}>OK</button>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </section>
  );
};

/** Correção do ADM na guia Jogadores: nome, sobrenome, ano, telefone (vazio mantém) e Player ID (vazio desfaz). */
export const PlayerEditor = ({ player, api, onSaved, onCancel }: {
  player: PlayerDetailDto; api: Api; onSaved: (player: PlayerDetailDto) => void; onCancel: () => void;
}) => {
  const [form, setForm] = useState<PlayerEditForm>({
    firstName: player.firstName, lastName: player.lastName, birthYear: String(player.birthYear), phone: '', playerId: player.playerId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof PlayerEditForm) => (e: Event) => { setForm({ ...form, [key]: (e.currentTarget as HTMLInputElement).value }); };

  const submit = (e: Event) => {
    e.preventDefault();
    if (!form.playerId.trim() && player.playerId && !confirm(`Tirar o Player ID ${player.playerId} de ${player.firstName}?`)) return;
    setBusy(true);
    setError(null);
    void api.editPlayer(player.id, editRequest(form))
      .then((result) => { if (result.ok) onSaved(result.body); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };

  return (
    <form class="m-0 flex flex-col gap-2" onSubmit={submit}>
      <label class={label}>Nome<input class={field} required value={form.firstName} onInput={set('firstName')} /></label>
      <label class={label}>Sobrenome<input class={field} required value={form.lastName} onInput={set('lastName')} /></label>
      <label class={label}>Ano de nascimento
        <input class={field} required inputMode="numeric" pattern="\d{4}" value={form.birthYear} onInput={set('birthYear')} />
      </label>
      <label class={label}>Telefone
        <input class={field} type="tel" placeholder={player.phone ? `${player.phone} (vazio mantém)` : 'sem telefone'} value={form.phone} onInput={set('phone')} />
      </label>
      <label class={label}>Player ID (vazio desfaz o vínculo)
        <input class={field} inputMode="numeric" value={form.playerId} onInput={set('playerId')} />
      </label>
      <div class="flex gap-2">
        <button type="submit" class={primary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        <button type="button" class={ghost} disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </form>
  );
};
