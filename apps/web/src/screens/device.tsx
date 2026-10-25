import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, cardWarn, Feedback, textButton, title } from '../ui.js';

interface Props {
  api: Api;
  onActivated: (me: MeResponse) => void;
  onCancel: () => void;
}

/** Sessão única: este celular só vira o ativo com confirmação, e o anterior é desconectado na hora. */
export const Device = ({ api, onActivated, onCancel }: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.activateSession(true);
      if (result.ok) onActivated(result.body);
      else setError(result.error.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class={cardWarn}>
      <h1 class={title}>Outro dispositivo está ativo</h1>
      <p class="m-0">Sua conta só fica ativa em um dispositivo por vez. <b>Entrar aqui desconecta o outro dispositivo.</b></p>
      <button type="button" class={bigPrimary} disabled={busy} onClick={() => { void activate(); }}>{busy ? 'Ativando…' : 'Entrar aqui'}</button>
      <button type="button" class={textButton} onClick={onCancel}>Agora não (sair)</button>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </section>
  );
};
