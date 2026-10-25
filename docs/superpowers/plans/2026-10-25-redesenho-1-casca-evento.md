# Redesenho 1: Tailwind, casca do ADM e aba Evento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tema escuro em Tailwind e a nova casca do ADM (menu lateral, topo com Abrir TV e status da pasta) com a aba Evento sem rolagem.

**Architecture:** O Tailwind v4 entra pelo plugin do Vite. O CSS de base que existe hoje (`styles.css`) vira `@layer base`/`@layer components` de `theme.css`, para as telas ainda não redesenhadas ficarem iguais. A casca do ADM é uma área de navegação no cliente (sem recarregar), porque a pasta do TOM só envia enquanto a página está aberta e a permissão de leitura é pedida de novo a cada recarga. O laço de envio sai do `FolderCard` para um hook na casca e continua rodando em qualquer aba.

**Tech Stack:** Preact 10, Vite, Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/vite`), lucide-preact, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-redesenho-design.md`

## Global Constraints

- Tema escuro único: fundo `#0f141b`, painel `#161d27`, linha `#263041`, texto `#e6ebf2`, apagado `#8b96a8`, destaque `#7aa2ff` (texto sobre ele `#0b1220`), verde `#22c55e`, laranja `#f59e0b`, vermelho `#ef4444`, cinza `#8b95a7`.
- Notebook a partir de 1280×720: as abas Evento e Rodada não rolam a página; listas longas rolam dentro do bloco.
- CSP `style-src 'self'`: o CSS sai do build, nada de CDN nem `style=` inline novo.
- Textos em pt-BR. Nunca mostrar sucesso falso: toda ação mostra o erro da API.
- Só a apresentação muda: nenhuma rota da API ou contrato novo.
- `class`, nunca `className`. Estado (hooks) separado da marcação (componentes).

## Review Focus

- Trocar de aba com a pasta do TOM conectada: o envio continua (o hook vive na casca, não na aba).
- Juiz escalado: vê a casca só com a aba Rodada; jogador continua na tela atual de celular.
- Sem evento ativo: a aba Evento mostra só "Criar evento"; o topo não quebra sem evento (sem nome, sem pasta).
- Tela de 1280×720: nenhuma barra de rolagem na página da aba Evento com 30 inscritos (a tabela rola por dentro).
- Voltar/avançar do navegador entre as abas troca a aba sem recarregar.

---

### Task 1: Tailwind e tema escuro, telas atuais iguais

**Files:**
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/index.html`
- Create: `apps/web/src/theme.css`
- Delete: `apps/web/src/styles.css`

- [ ] **Step 1:** `npm install -w @tom/web tailwindcss@^4 @tailwindcss/vite@^4 lucide-preact` e adicionar `tailwindcss()` aos `plugins` do `vite.config.ts`.
- [ ] **Step 2:** Criar `theme.css`: `@import "tailwindcss";`, um `@theme` com as cores do Global Constraints (`--color-bg`, `--color-panel`, `--color-line`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-text`, `--color-ok`, `--color-error`, `--color-warn`, `--color-gray`, `--color-orange`, `--color-green`, `--color-red`), e todo o conteúdo de `styles.css` em `@layer base` (regras de elemento) e `@layer components` (classes), só com os valores escuros (sai o `@media (prefers-color-scheme)` e o tema claro). As variáveis antigas (`--bg`, `--card`…) passam a apontar para as novas, para `panel.css` e `tv.css` seguirem funcionando.
- [ ] **Step 3:** Em `main.tsx`, trocar `import './styles.css'` por `import './theme.css'`; apagar `styles.css`; `<meta name="theme-color" content="#0f141b">` no `index.html`.
- [ ] **Step 4:** Rodar `npm run check` (esperado: tudo passa) e `npm run build -w @tom/web` (esperado: build sem erro, um `.css` em `dist/assets`).
- [ ] **Step 5:** Conferir com a skill browser-automation sobre `vite preview` (não `vite dev`, ver armadilhas do ambiente): `/` e `/tv?demo` renderizam sem erro no console e com o fundo escuro.
- [ ] **Step 6:** Commit `feat: Tailwind e tema escuro único`.

### Task 2: Abas do ADM e navegação sem recarregar

**Files:**
- Create: `apps/web/src/admin/tabs.ts`, `apps/web/test/admin-tabs.test.ts`

**Interfaces:**
- Produces: `type AdminTab = 'evento' | 'rodada' | 'inscritos' | 'equipe' | 'jogadores'`; `ADMIN_TABS: readonly { tab: AdminTab; path: string; label: string }[]` (`/conta`, `/painel`, `/conta/inscritos`, `/conta/equipe`, `/conta/jogadores`); `tabsFor(role: 'admin' | 'judge'): AdminTab[]`; `tabFor(pathname: string, role: 'admin' | 'judge'): AdminTab`.

- [ ] **Step 1: Teste**

```ts
it('cada caminho abre a sua aba; desconhecido cai na primeira do papel', () => {
  expect(tabFor('/conta', 'admin')).toBe('evento');
  expect(tabFor('/painel', 'admin')).toBe('rodada');
  expect(tabFor('/conta/equipe', 'admin')).toBe('equipe');
  expect(tabFor('/conta/xyz', 'admin')).toBe('evento');
  expect(tabFor('/conta', 'judge')).toBe('rodada');
});
it('juiz só tem a aba Rodada', () => {
  expect(tabsFor('judge')).toEqual(['rodada']);
  expect(tabsFor('admin')).toEqual(['evento', 'rodada', 'inscritos', 'equipe', 'jogadores']);
});
```

- [ ] **Step 2:** `npx vitest run apps/web/test/admin-tabs.test.ts`: falha (módulo não existe).
- [ ] **Step 3:** Implementar `tabs.ts`.
- [ ] **Step 4:** O teste passa.
- [ ] **Step 5:** Commit `feat: abas do ADM`.

### Task 3: Etapas do evento

**Files:**
- Create: `apps/web/src/admin/steps.ts`, `apps/web/test/admin-steps.test.ts`

**Interfaces:**
- Produces: `type StepState = 'done' | 'now' | 'todo'`; `eventSteps(status: EventStatusDto | null): { label: string; state: StepState }[]` com os rótulos `Evento criado`, `Inscrições (QR)`, `Confirmação`, `Rodadas`, `Resultado final`.

- [ ] **Step 1: Teste**

```ts
it('a etapa atual segue o status do evento', () => {
  const states = (s: EventStatusDto | null) => eventSteps(s).map((x) => x.state);
  expect(states(null)).toEqual(['now', 'todo', 'todo', 'todo', 'todo']);
  expect(states('open')).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
  expect(states('confirming')).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  expect(states('running')).toEqual(['done', 'done', 'done', 'now', 'todo']);
  expect(states('final')).toEqual(['done', 'done', 'done', 'done', 'now']);
  expect(states('closed')).toEqual(['done', 'done', 'done', 'done', 'done']);
});
```

- [ ] **Step 2:** Rodar: falha.
- [ ] **Step 3:** Implementar `steps.ts` (`cancelled` igual a `closed`).
- [ ] **Step 4:** Passa.
- [ ] **Step 5:** Commit `feat: etapas do evento`.

### Task 4: Pasta do TOM como hook da casca

**Files:**
- Create: `apps/web/src/tom-folder/use-tom-folder.ts`, `apps/web/src/admin/folder-box.tsx`
- Delete: `apps/web/src/tom-folder/folder-card.tsx`
- Modify: `apps/web/src/screens/event-panel.tsx` (deixa de renderizar o `FolderCard`)

**Interfaces:**
- Produces: `useTomFolder(api: Api, event: EventDto | null): { state: FolderState; connect(): void; allow(): void; retry(): void }`. Sem evento, `state` é `{ kind: 'no-event' }` e nada roda. `FolderBox({ folder }: { folder: ReturnType<typeof useTomFolder> })`: o bloco visual (status com `folderStatus`, botões Conectar, Permitir, Tentar de novo e Trocar pasta, com as mesmas regras de hoje). `FolderDot({ state }: { state: FolderState })`: o ponto e o texto curto do topo.

- [ ] **Step 1:** Mover para o hook, sem mudar a lógica, o laço de envio, a pasta lembrada, a permissão e o `folderVersion` do `FolderCard` (os testes de `status.ts`, `browser-folder` e `stores` cobrem as regras). A troca do `event.id` reinicia o laço, como hoje.
- [ ] **Step 2:** `npm run check`: passa.
- [ ] **Step 3:** Commit `refactor: pasta do TOM como hook, para enviar em qualquer aba`.

### Task 5: Casca do ADM e aba Evento

**Files:**
- Create: `apps/web/src/admin/use-active-event.ts`, `apps/web/src/admin/admin-shell.tsx`, `apps/web/src/admin/event-tab.tsx`
- Modify: `apps/web/src/app.tsx`, `apps/web/src/screens/event-panel.tsx` (vira o bloco Configuração, sem cartão), `apps/web/src/screens/registrations.tsx` (tabela que rola dentro do bloco)

**Interfaces:**
- Consumes: `tabFor`, `tabsFor`, `ADMIN_TABS` (Task 2); `eventSteps` (Task 3); `useTomFolder`, `FolderBox`, `FolderDot` (Task 4).
- Produces: `useActiveEvent(api: Api): { event: EventDto | null | undefined; reload(): Promise<void> }`, com polling de 15 s e recarga ao voltar para a aba (padrão de `my-event.tsx`). `AdminShell({ api, me, onSignOut })`.

- [ ] **Step 1:** `app.tsx`: com `screen.name === 'home'` e (`me.role === 'admin'` ou `me.judging`), renderizar `AdminShell` no lugar de `Home`/`PanelScreen`; o `<main>` estreito e o cabeçalho atual só ficam nas outras telas. Jogador e juiz fora do evento seguem em `Home`.
- [ ] **Step 2:** `AdminShell`: grade `grid-cols-[210px_1fr] h-dvh` (sem rolagem da página). Menu com Good Gamë, as abas de `tabsFor` (Rodada com o número da rodada atual quando houver; Inscritos com a quantidade) e o rodapé com nome, papel, e-mail e "Sair deste dispositivo". Topo com nome e data do evento, `FolderDot`, **Abrir TV ↗** (`<a href="/tv" target="_blank" rel="noopener">`) e "Ir para a rodada" na aba Evento. Links das abas com `history.pushState` e um ouvinte `popstate`, sem recarregar. O `useTomFolder` fica aqui.
- [ ] **Step 3:** Aba Evento: faixa de `eventSteps` (o botão "Pedir confirmação" na etapa Inscrições quando `open`; "Encerrar evento" na Resultado final quando `final`) e três colunas `grid-cols-[1fr_1fr_1.3fr]`: Configuração (`EventPanel` sem o cartão) · `FolderBox` e Juízes escalados · Inscritos (`RegistrationsCard` em tabela: Player ID, nome, presença, no TOM, ações), com "Inscrever à mão" embaixo e `overflow-y-auto` só na tabela. Sem evento: só o formulário Criar evento. As abas Rodada, Inscritos, Equipe e Jogadores mostram por ora `PanelScreen`, `RegistrationsCard`, `TeamCard` e `UnlinkCard` dentro da casca.
- [ ] **Step 4:** `npm run check`: passa.
- [ ] **Step 5:** Conferir em 1280×720 (browser-automation sobre `vite preview` com a API de testes, ou em produção logado como ADM): nenhuma rolagem da página na aba Evento, trocar de aba mantém a pasta enviando, Abrir TV abre `/tv` numa aba nova, voltar do navegador troca a aba.
- [ ] **Step 6:** Commit `feat: casca do ADM e aba Evento`, push e PR (regra: PR direto ao fim da etapa; o merge é do usuário).
