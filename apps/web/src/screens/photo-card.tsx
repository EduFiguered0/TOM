import type { MeResponse } from '@tom/contracts';
import { useMemo, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { Avatar } from '../photo/avatar.js';
import { createPhotoCache, needsImageConsent } from '../photo/photo-cache.js';
import { shrinkPhoto } from '../photo/shrink.js';
import { displayName } from '@tom/contracts';
import { Feedback, ghost, label } from '../ui.js';

/** Foto do perfil: aparece numa bolinha antes do nome na mesa (TV e celular do oponente). */
export const PhotoCard = ({ me, api, onSaved }: { me: MeResponse; api: Api; onSaved: (me: MeResponse) => void }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cache = useMemo(() => createPhotoCache(async (id) => {
    const result = await api.photo(id);
    return result.ok ? result.body.photo : null;
  }), [api]);
  const minor = needsImageConsent(me.profile.birthYear);
  const hidden = minor && !me.imageConsent;

  const run = (action: () => Promise<{ ok: true; body: MeResponse } | { ok: false; error: { message: string } }>, done: string) => {
    setBusy(true);
    setMessage(null);
    void action()
      .then((result) => { if (result.ok) { onSaved(result.body); setMessage({ ok: true, text: done }); } else setMessage({ ok: false, text: result.error.message }); })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); });
  };

  const pick = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    run(async () => api.setPhoto(await shrinkPhoto(file)), 'Foto salva.');
  };

  return (
    <section class="flex flex-col gap-3 rounded-xl border border-line p-4" aria-label="Foto">
      <div class="flex items-center gap-3">
        <Avatar photo={me.photo} name={displayName(me.profile)} cache={cache} class="size-16 text-[2rem]" />
        <div class="flex flex-col gap-1 text-sm">
          <b>Sua foto</b>
          <span class="text-muted">{hidden ? 'Só aparece na mesa com a autorização do responsável.' : 'Aparece antes do seu nome na mesa.'}</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <label class={`${ghost} cursor-pointer`}>
          {me.photo ? 'Trocar foto' : 'Pôr foto'}
          <input type="file" accept="image/*" class="hidden" disabled={busy} onChange={pick} />
        </label>
        {me.photo && <button type="button" class={ghost} disabled={busy} onClick={() => { run(() => api.setPhoto(null), 'Foto removida.'); }}>Tirar foto</button>}
      </div>
      {minor && (
        <label class={`${label} flex-row items-start gap-3 text-sm text-text`}>
          <input type="checkbox" class="mt-1 size-4 accent-accent" checked={me.imageConsent} disabled={busy}
            onChange={(e) => { const on = e.currentTarget.checked; run(() => api.setImageConsent(on), on ? 'Autorização salva.' : 'Autorização retirada.'); }} />
          O responsável autoriza mostrar a foto nas mesas.
        </label>
      )}
      <Feedback message={message} />
    </section>
  );
};
