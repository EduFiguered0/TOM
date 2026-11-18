import type { ProfileInput, Utm } from '@tom/landing-core';
import type { Google, Session } from '@tom/web-auth';
import { useEffect, useState } from 'preact/hooks';
import { errorMessage, type LandingApi, type MeResponse, type PublicEvent } from './api.js';
import { nextStep } from './flow.js';
import { EventList } from './screens/events.js';
import { ProfileForm, type FieldError } from './screens/profile-form.js';

/** Torneio escolhido antes do login: sobrevive à ida ao Google. */
export interface WantStore {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

interface Props {
  api: LandingApi;
  session: Session;
  google: Google;
  utm: Utm;
  wants: WantStore;
  /** Erro na volta do Google (cancelado, falhou). */
  loginError: string | null;
  /** Navegação para fora (Google, LigaMagic). */
  go: (url: string) => void;
}

const PROFILE_ERRORS = new Set(['PROFILE_INCOMPLETE', 'TERMS_OUTDATED']);

export const App = ({ api, session, google, utm, wants, loginError, go }: Props) => {
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loginError);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [saving, setSaving] = useState(false);

  const fail = (code: string) => { setBusy(null); setError(errorMessage(code)); };

  const checkout = async (eventId: string) => {
    const result = await api.checkout(eventId, utm);
    if (result.ok) {
      wants.clear();
      go(result.body.url);
      return;
    }
    if (PROFILE_ERRORS.has(result.error)) { setEditing(true); setBusy(null); return; }
    wants.clear();
    fail(result.error);
  };

  const proceed = async (eventId: string) => {
    setError(null);
    setBusy(eventId);
    wants.set(eventId);
    if (nextStep({ loggedIn: session.loggedIn, me: null, wantsEvent: eventId }) === 'login') { go(await google.authorizeUrl()); return; }
    const loaded = await api.me(utm);
    if (!loaded.ok) {
      if (loaded.status === 401) { await session.signOut(); go(await google.authorizeUrl()); return; }
      fail(loaded.error);
      return;
    }
    setMe(loaded.body);
    if (nextStep({ loggedIn: true, me: loaded.body, wantsEvent: eventId }) === 'profile') { setEditing(true); setBusy(null); return; }
    await checkout(eventId);
  };

  const save = async (input: ProfileInput) => {
    setSaving(true);
    setFieldError(null);
    const result = await api.saveProfile(input);
    setSaving(false);
    if (!result.ok) {
      setFieldError({ field: (result.field as keyof ProfileInput | undefined) ?? null, message: result.message ?? errorMessage(result.error) });
      return;
    }
    setMe(result.body);
    setEditing(false);
    const eventId = wants.get();
    if (eventId) { setBusy(eventId); await checkout(eventId); }
  };

  useEffect(() => {
    void api.events().then((r) => { if (r.ok) setEvents(r.body.events); else setError(errorMessage(r.error)); });
    // Volta do Google com um torneio escolhido: continua de onde parou.
    const pending = wants.get();
    if (pending && session.loggedIn && !loginError) void proceed(pending);
  }, []);

  return (
    <div class="mx-auto grid max-w-5xl gap-6 px-4 py-6">
      <header class="grid justify-items-center gap-3 text-center">
        <img src="/logo-180.png" alt="Good Game TCG" width={96} height={96} class="rounded-xl" />
        <h1 class="m-0 text-3xl font-extrabold tracking-tight sm:text-4xl">Yu-Gi-Oh! <span class="text-gold">OTS Championship</span></h1>
        <p class="m-0 max-w-xl text-muted">Dois dias de torneio na Good Game TCG, em Campo Grande (RJ). Escolha o seu e garanta o ingresso.</p>
      </header>
      <main class="grid gap-6">
        {error && <p role="alert" class="m-0 rounded-xl border border-brand bg-brand-dark/30 p-3 text-center">{error}</p>}
        {editing && me
          ? <ProfileForm me={me} saving={saving} error={fieldError} onSubmit={(input) => { void save(input); }}
              onCancel={() => { setEditing(false); wants.clear(); }} />
          : events
            ? <EventList events={events} busy={busy} onBuy={(id) => { void proceed(id); }} />
            : !error && <p class="text-center text-muted">Carregando torneios…</p>}
        <p class="m-0 text-center text-xs text-muted">A compra e o pagamento são feitos na loja da Good Game na LigaMagic.</p>
      </main>
      <Footer />
    </div>
  );
};

export const Footer = () => (
  <footer class="grid gap-1 border-t border-line pt-4 text-center text-xs text-muted">
    <nav aria-label="Documentos" class="flex justify-center gap-4">
      <a class="text-gold underline" href="/termos">Termos de Uso</a>
      <a class="text-gold underline" href="/privacidade">Política de Privacidade</a>
    </nav>
    <p class="m-0">GOOD GAME TCG LTDA · CNPJ 54.733.547/0001-25 · Estrada do Mendanha, 646, Loja B, Campo Grande, Rio de Janeiro/RJ</p>
    <p class="m-0">Contato: gg.goodgame.tcg@gmail.com</p>
  </footer>
);
