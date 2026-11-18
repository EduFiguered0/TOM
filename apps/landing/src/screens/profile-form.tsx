import { InvalidLeadError, validProfile, type ProfileInput } from '@tom/landing-core';
import { useState } from 'preact/hooks';
import type { MeResponse } from '../api.js';

export type FieldError = { field: keyof ProfileInput | null; message: string } | null;

interface Props {
  me: MeResponse;
  saving: boolean;
  error: FieldError;
  onSubmit: (input: ProfileInput) => void;
  onCancel: () => void;
}

const input = 'min-h-12 w-full rounded-lg border border-line bg-bg px-3 text-text focus-visible:outline-2 focus-visible:outline-gold';
const label = 'grid gap-1 text-sm font-medium';

/** Cadastro complementar em uma tela: nome e e-mail do Google, telefone, nascimento e aceites. Sem CPF. */
export const ProfileForm = ({ me, saving, error, onSubmit, onCancel }: Props) => {
  const [values, setValues] = useState<ProfileInput>({
    fullName: me.lead.fullName, phone: me.lead.phone ?? '', birthDate: me.lead.birthDate ?? '',
    acceptTerms: me.termsAccepted, marketingOptIn: me.lead.marketingOptIn,
  });
  const [local, setLocal] = useState<FieldError>(null);
  const shown = local ?? error;
  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => { setValues({ ...values, [key]: value }); };
  const errorFor = (field: keyof ProfileInput) => (shown?.field === field ? shown.message : null);
  const describe = (field: keyof ProfileInput) => (errorFor(field) ? { 'aria-invalid': true, 'aria-describedby': `erro-${field}` } : {});
  const message = (field: keyof ProfileInput) => {
    const text = errorFor(field);
    return text ? <span id={`erro-${field}`} role="alert" class="text-sm text-error">{text}</span> : null;
  };

  const submit = (event: Event) => {
    event.preventDefault();
    try {
      validProfile(values, new Date());
      setLocal(null);
      onSubmit(values);
    } catch (e) {
      if (e instanceof InvalidLeadError) setLocal({ field: e.field, message: e.message });
      else throw e;
    }
  };

  return (
    <section aria-labelledby="cadastro" class="mx-auto grid max-w-lg gap-4 rounded-2xl border border-line bg-panel p-5">
      <h2 id="cadastro" class="m-0 text-xl font-bold text-gold">Complete seu cadastro</h2>
      <p class="m-0 text-sm text-muted">Só falta isso para seguir para a compra do ingresso.</p>
      <form class="grid gap-4" onSubmit={submit} noValidate>
        <label class={label}>Nome completo
          <input class={input} name="fullName" autoComplete="name" value={values.fullName} required {...describe('fullName')}
            onInput={(e) => { set('fullName', e.currentTarget.value); }} />
          {message('fullName')}
        </label>
        <label class={label}>E-mail (da sua conta Google)
          <input class={`${input} opacity-70`} value={me.lead.email} readOnly />
        </label>
        <label class={label}>Telefone com DDD
          <input class={input} name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(21) 99999-9999" value={values.phone} required
            {...describe('phone')} onInput={(e) => { set('phone', e.currentTarget.value); }} />
          {message('phone')}
        </label>
        <label class={label}>Data de nascimento
          <input class={input} name="birthDate" type="date" autoComplete="bday" value={values.birthDate} required {...describe('birthDate')}
            onInput={(e) => { set('birthDate', e.currentTarget.value); }} />
          {message('birthDate')}
        </label>
        <label class="flex items-start gap-3 text-sm">
          <input type="checkbox" class="mt-1 size-5 accent-brand" checked={values.acceptTerms} required {...describe('acceptTerms')}
            onChange={(e) => { set('acceptTerms', e.currentTarget.checked); }} />
          <span>Li e aceito os <a class="text-gold underline" href="/termos" target="_blank" rel="noopener">Termos de Uso</a> e
            a <a class="text-gold underline" href="/privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span>
        </label>
        {message('acceptTerms')}
        <label class="flex items-start gap-3 text-sm">
          <input type="checkbox" class="mt-1 size-5 accent-brand" checked={values.marketingOptIn}
            onChange={(e) => { set('marketingOptIn', e.currentTarget.checked); }} />
          <span>Quero receber novidades e convites de eventos da Good Game (opcional).</span>
        </label>
        {shown && !shown.field && <p role="alert" class="m-0 text-sm text-error">{shown.message}</p>}
        <div class="flex flex-wrap gap-3">
          <button type="submit" disabled={saving}
            class="min-h-12 flex-1 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-60">
            {saving ? 'Salvando…' : 'Salvar e continuar'}
          </button>
          <button type="button" onClick={onCancel} class="min-h-12 rounded-xl border border-line px-4 text-muted focus-visible:outline-2 focus-visible:outline-gold">
            Voltar
          </button>
        </div>
      </form>
    </section>
  );
};
