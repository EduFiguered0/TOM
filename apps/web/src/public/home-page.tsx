import { useEffect } from 'preact/hooks';
import { STORE } from './store.js';
import { bigPrimary, card, muted, page, textButton } from '../ui.js';

interface Props {
  loggedIn: boolean;
  onSignOut: () => void;
}

/** Home pública da loja: sem login e sem chamar a API. Fotos e menu de eventos ficam para outra spec. */
export const HomePage = ({ loggedIn, onSignOut }: Props) => {
  useEffect(() => { document.title = STORE.name; }, []);
  return (
    <main class={page}>
      <section class={card}>
        <h1 class="m-0 text-2xl font-bold">{STORE.name}</h1>
        <p class={muted}>Torneios de Pokémon TCG</p>
        <p class="m-0">{STORE.address}</p>
        <p class="m-0"><a class="text-accent" href={STORE.instagram} target="_blank" rel="noopener noreferrer">Instagram {STORE.instagramHandle}</a></p>
        <a class={bigPrimary} href="/conta">{loggedIn ? 'Minha conta' : 'Entrar'}</a>
        {loggedIn && <button type="button" class={textButton} onClick={onSignOut}>Sair</button>}
      </section>
      <footer class="text-center text-sm"><a class="text-accent" href="/privacidade">Política de privacidade</a></footer>
    </main>
  );
};
