import { useEffect } from 'preact/hooks';
import { card, page, title } from '../ui.js';
import { STORE } from './store.js';

/** Política de privacidade (LGPD): pública, linkada da home e do cadastro. */
export const PrivacyPage = () => {
  useEffect(() => { document.title = `Privacidade · ${STORE.name}`; }, []);
  return (
    <main class={page}>
      <header><a class="font-bold text-text no-underline" href="/">{STORE.name}</a></header>
      <article class={`${card} gap-2 [&_h2]:mt-3 [&_h2]:mb-0 [&_h2]:text-lg [&_h2]:font-bold [&_p]:m-0`}>
        <h1 class={title}>Política de privacidade</h1>
        <p class="text-sm text-muted">Atualizada em 24 de outubro de 2026.</p>
        <h2>Quem cuida dos seus dados</h2>
        <p>A {STORE.name}, {STORE.address}, é a controladora dos dados deste sistema de torneios.</p>
        <h2>Quais dados guardamos</h2>
        <p>Nome, Player ID, e-mail, ano de nascimento e telefone (opcional).</p>
        <h2>Para quê</h2>
        <p>Organizar os torneios, registrar o histórico das suas participações e, no futuro, montar o ranking da loja.</p>
        <h2>Com quem compartilhamos</h2>
        <p>Com ninguém. Os dados ficam na AWS, que hospeda o sistema. Ao entrar pelo Google, usamos só o seu e-mail.</p>
        <h2>Por quanto tempo</h2>
        <p>Os dados são apagados depois de 24 meses sem participar de nenhum evento.</p>
        <h2>Menores de idade</h2>
        <p>O cadastro de menores de 18 anos precisa da autorização do responsável legal.</p>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir acesso, correção ou exclusão dos seus dados pelo direct do Instagram{' '}
          <a class="text-accent" href={STORE.instagram} target="_blank" rel="noopener noreferrer">{STORE.instagramHandle}</a>. Respondemos em até 15 dias.
        </p>
      </article>
    </main>
  );
};
