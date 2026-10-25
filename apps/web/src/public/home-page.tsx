import { useEffect } from 'preact/hooks';
import { STORE } from './store.js';

interface Props {
  loggedIn: boolean;
  onSignOut: () => void;
}

/** Home pública da loja: sem login e sem chamar a API. Fotos e menu de eventos ficam para outra spec. */
export const HomePage = ({ loggedIn, onSignOut }: Props) => {
  useEffect(() => { document.title = STORE.name; }, []);
  return (
    <main class="legacy">
      <section class="card">
        <h1>{STORE.name}</h1>
        <p class="muted">Torneios de Pokémon TCG</p>
        <p>{STORE.address}</p>
        <p><a href={STORE.instagram} target="_blank" rel="noopener noreferrer">Instagram {STORE.instagramHandle}</a></p>
        <a class="button" href="/conta">{loggedIn ? 'Minha conta' : 'Entrar'}</a>
        {loggedIn && <button type="button" class="link" onClick={onSignOut}>Sair</button>}
      </section>
      <footer class="muted center"><a href="/privacidade">Política de privacidade</a></footer>
    </main>
  );
};
