# Player ID sem conferência, home pública e privacidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Player ID vale desde o cadastro (o primeiro a cadastrar fica com ele), o ADM pode desfazer um vínculo errado, e o site ganha a home pública da Good Gamë e a página de privacidade.

**Architecture:** `Account.playerId` deixa de ter "confirmado" e vira `PlayerId | null`; a trava de unicidade do Player ID passa a valer no cadastro. A confirmação no check-in sai (rotas, tela e aviso). O site separa a vitrine pública (`/`, `/privacidade`) da área logada (`/conta`); o retorno do Google continua em `/` e é levado para `/conta`.

**Tech Stack:** TypeScript, Preact, Vitest, DynamoDB (tabela `Accounts` existente).

**Spec:** `docs/superpowers/specs/2026-10-24-eventos-qr-design.md` (seções "Site público" e "Player ID sem conferência do ADM"); base em `docs/spec-tom.md`.

Plano 2 de 5 (antes: login com senha e Google; depois: equipe e juízes; ciclo do evento com QR; histórico).

## Global Constraints

- Região us-east-2, perfil `tom`; nenhum recurso AWS novo (custo US$ 0).
- "O Player ID trava na hora do cadastro: o primeiro a cadastrar fica com ele."
- Mensagem exata: `Esse Player ID já está em uso, procure o ADM`.
- "Desfazer vínculo" é só do ADM e fica registrado como evento de auditoria (autor, horário, conta afetada).
- Visitante sem login não executa ação nem vê dado pessoal de ninguém.
- Loja: **Good Gamë**, Instagram `@goodgame.tcg` (`https://www.instagram.com/goodgame.tcg/`), Estrada do Mendanha, 646, loja B, Rio de Janeiro, RJ, 23087-285. Contato LGPD: direct do Instagram, resposta em até 15 dias.
- Textos em pt-BR. `npm run check` verde ao fim de cada tarefa.
- Deploy com IAM: o usuário roda no PowerShell (`cd infra; npx cdk deploy <stacks> --profile tom`). Este plano não muda IAM: `TomApi` e o site bastam.

## Review Focus

1. Player ID já em uso no cadastro: 409 com a mensagem exata e nada gravado (nem a conta). → teste na Tarefa 2.
2. Depois do "Desfazer vínculo", a conta errada continua logada mas sem poder agir, e o dono verdadeiro consegue cadastrar o mesmo Player ID. → teste na Tarefa 3.
3. Conta gravada no formato antigo (`playerId: { value, confirmed }`) é lida como Player ID válido. → teste na Tarefa 1.
4. Volta do Google cai em `/conta`, não na home pública. → verificação no navegador na Tarefa 4.
5. Jogador que já tem Player ID tenta trocar sozinho: recusado (só pelo ADM). → teste na Tarefa 2.

---

### Task 1: Player ID sem "confirmado" no modelo e nos repositórios

**Files:**
- Modify: `packages/core/src/identity/account.ts`, `packages/core/src/identity/account-repository.ts`, `packages/core/src/identity/in-memory-account-repository.ts`, `packages/aws-adapters/src/dynamo-account-repository.ts`
- Test: `packages/core/test/identity/account-repository-contract.ts`, `packages/aws-adapters/test/dynamo-account-repository.test.ts` (o teste offline do formato antigo; criar se não existir um arquivo offline)

**Interfaces:**
- Produces: `Account.playerId: PlayerId | null`. Porta: `findByPlayerId(playerId: PlayerId): Promise<AccountRecord | null>` (substitui `findByConfirmedPlayerId`). `save` lança `PlayerIdTakenError` quando o Player ID já é de outra conta, sempre (não só "confirmado"). `fromStored(stored)` exportada do adaptador DynamoDB.

- [ ] **Step 1: Write the failing tests** — no contrato: substitua os três testes de "confirmado" por `acha a conta pelo Player ID assim que gravada`, `um Player ID nunca fica em duas contas` (segunda conta com o mesmo Player ID → `PlayerIdTakenError`) e `tirar ou trocar o Player ID libera o anterior` (conta A troca para `null`; conta B grava o antigo sem erro). Teste offline do adaptador:

```ts
expect(fromStored({ ...stored, playerId: { value: '1122334', confirmed: false } } as never).playerId).toBe('1122334');
expect(fromStored({ ...stored, playerId: '1122334' } as never).playerId).toBe('1122334');
expect(fromStored({ ...stored, playerId: null } as never).playerId).toBeNull();
```

- [ ] **Step 2: Run** `npx vitest run packages/core/test/identity packages/aws-adapters/test/dynamo-account-repository.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — tipo novo; `locksOf` trava o Player ID sempre que houver um; `fromStored` converte o objeto antigo (`{ value }`) para o valor. O comentário da porta e das travas perde "confirmado". Ajuste os demais usos apontados pelo typecheck **só dentro de `packages/`** (o `AccountService` segue na Tarefa 2; aqui basta compilar: `account.playerId?.confirmed` vira `account.playerId !== null`).
- [ ] **Step 4: Run** `npx vitest run packages` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: Player ID sem confirmação no modelo e nas travas`

### Task 2: Cadastro trava o Player ID; jogador informa depois; ADM desfaz o vínculo

**Files:**
- Modify: `packages/core/src/identity/account-service.ts`, `packages/core/src/identity/account.ts` (eventos)
- Test: `packages/core/test/identity/account-service.test.ts`

**Interfaces:**
- Consumes: `findByPlayerId`, `PlayerIdTakenError` (Tarefa 1).
- Produces (o `AccountService` perde `getAccount` e `confirmPlayerId`):
  - `claimPlayerId(identity: Identity, playerId: string): Promise<Account>` — só para conta sem Player ID; com Player ID → `CommandRejected('player_id_set', 'Seu Player ID já está cadastrado. Para trocar, procure o ADM.')`.
  - `findByPlayerId(actor: Actor | null, playerId: string): Promise<Account>` — só ADM; sem conta → `CommandRejected('account_not_found', 'Nenhuma conta com esse Player ID')`.
  - `unlinkPlayerId(actor: Actor | null, playerId: string): Promise<Account>` — só ADM; tira o Player ID da conta e devolve a conta sem ele.
  - Eventos: `player_id_claimed` (no cadastro e no `claimPlayerId`) e `player_id_unlinked { playerId }` com o ADM como `actor`; sai `player_id_confirmed`.
  - `actorFor`: jogador com qualquer Player ID age.
  - Player ID em uso (no `register` ou no `claimPlayerId`) → `CommandRejected('player_id_taken', 'Esse Player ID já está em uso, procure o ADM')`.
  - `RejectCode` ganha `player_id_set`.

- [ ] **Step 1: Write the failing tests** — substitua os testes de check-in por:
  - `cadastro com Player ID já age como jogador`: `authenticate` devolve `actor: { role: 'player', playerId: '100001' }`.
  - `Player ID em uso no cadastro: recusa com a mensagem e não grava a conta`: segundo `register` com `'100001'` rejeita `player_id_taken` com a mensagem exata, e `authenticate` da segunda identidade dá `account_not_found`.
  - `conta sem Player ID informa depois; com Player ID, só o ADM troca`: `claimPlayerId` grava e o ator vira jogador; o segundo `claimPlayerId` rejeita `player_id_set`.
  - `ADM desfaz o vínculo: a conta perde o poder de agir e o dono verdadeiro cadastra o mesmo Player ID`: `unlinkPlayerId(admin, '100001')` → conta com `playerId: null`, último evento `{ type: 'player_id_unlinked', playerId: '100001', actor: admin }`; `authenticate` da conta errada dá `actor: null`; `register` do dono com `'100001'` passa.
  - `só o ADM busca e desfaz; Player ID sem conta dá 404`: jogador → `forbidden`; `findByPlayerId(admin, '999999')` → `account_not_found`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/identity/account-service.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — `PlayerIdTakenError` no `execute` e no `register` vira a recusa acima. O comentário do `register` perde "pendente até o ADM confirmar".
- [ ] **Step 4: Run** `npx vitest run packages` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: Player ID vale no cadastro; ADM desfaz vínculo errado`

### Task 3: Contratos e rotas da API

**Files:**
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/api.ts`, `apps/api/test/support.ts`
- Test: `apps/api/test/api.test.ts`, `apps/api/test/round.test.ts` (só o que usava a confirmação)

**Interfaces:**
- Consumes: os métodos da Tarefa 2.
- Produces:
  - `AccountResponse.playerId` e `MeResponse.playerId: string | null`. `MeResponse.canAct` continua `actor !== null` (jogador sem Player ID: `false`).
  - `PlayerIdRequest { playerId: string }` com `parsePlayerIdRequest` (substitui `ConfirmPlayerIdRequest`).
  - Rotas: saem `GET /accounts/{id}` e `POST /accounts/{id}/player-id`. Entram `POST /me/player-id` (qualquer conta; corpo `PlayerIdRequest`; devolve `MeResponse`), `GET /player-ids/{pid}` (ADM; devolve `AccountResponse`) e `POST /player-ids/{pid}/unlink` (ADM; devolve `AccountResponse`). `{pid}` = só dígitos (`([0-9]{1,20})`).
  - Status: `player_id_set` → 409.
  - `support.ts`: `setupRound` não chama mais a confirmação (o cadastro já vale).

- [ ] **Step 1: Write the failing tests** (`api.test.ts`): `cadastro com Player ID já pode agir` (`POST /me` com `'100001'` → `canAct: true`, `playerId: '100001'`); `Player ID em uso: 409 com a mensagem`; `POST /me/player-id` para conta sem Player ID → 200 com `canAct: true`, de novo → 409 `player_id_set`; `ADM busca e desfaz o vínculo; jogador recebe 403` (`GET /player-ids/100001` com `adm:a1:admin` → 200 com o nome; com token de jogador → 403; `POST /player-ids/100001/unlink` → 200 com `playerId: null`; depois o `GET /me` da conta errada → `canAct: false`); `rotas antigas de check-in não existem mais` (`GET /accounts/<uuid>` → 404 `not_found` do roteador).
- [ ] **Step 2: Run** `npx vitest run apps/api` — Expected: FAIL.
- [ ] **Step 3: Implement** as rotas e o contrato; atualize o comentário de `MeResponse.canAct`.
- [ ] **Step 4: Run** `npm run check` — Expected: PASS (o `apps/web` compila depois de trocar `me.playerId?.value` por `me.playerId` e remover a chamada `confirmPlayerId`/`account` de `apps/web/src/api.ts`; a tela de check-in pode ficar quebrada só no visual até a Tarefa 5 — se o typecheck reclamar de `checkin.tsx`, apague-a já aqui e tire o uso em `home.tsx`).
- [ ] **Step 5: Commit** — `feat: rotas de Player ID sem check-in`

### Task 4: Home pública, privacidade e área logada em `/conta`

**Files:**
- Create: `apps/web/src/public/home-page.tsx`, `apps/web/src/public/privacy-page.tsx`, `apps/web/src/public/store.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/test/routes.test.ts`

**Interfaces:**
- Produces:
  - `store.ts`: `export const STORE = { name: 'Good Gamë', instagram: 'https://www.instagram.com/goodgame.tcg/', instagramHandle: '@goodgame.tcg', address: 'Estrada do Mendanha, 646, loja B, Rio de Janeiro, RJ, 23087-285' } as const`.
  - `pageFor(pathname: string): 'tv' | 'home' | 'privacy' | 'account'` em `apps/web/src/routes.ts` (`/tv*` → `tv`; `/` → `home`; `/privacidade` → `privacy`; `/conta*` e `/painel*` → `account`; qualquer outro → `home`).
- Comportamento:
  - `/` (público, sem chamar a API): nome da loja, endereço, link do Instagram e o botão **"Entrar"** (link para `/conta`); com `session.loggedIn`, o botão vira **"Minha conta"** e aparece **"Sair"**. Rodapé com link para `/privacidade`. O conteúdo da loja (fotos, menu de eventos) fica para outra spec.
  - `/privacidade` (público): quem é o controlador (Good Gamë, endereço), dados guardados (nome, Player ID, e-mail, ano de nascimento, telefone opcional), finalidade (organização dos torneios, histórico de participações e ranking futuro), sem compartilhamento com terceiros (os dados ficam na AWS, que hospeda o sistema), login pelo Google usa só o e-mail, prazo de 24 meses sem participar, menores com autorização do responsável, direitos do titular (acesso, correção, exclusão) e o canal: direct do Instagram `@goodgame.tcg`, resposta em até 15 dias. Data de atualização: 24 de outubro de 2026.
  - `/conta`: o `App` de hoje. O cabeçalho do `App` mostra **Good Gamë** como link para `/`.
  - Retorno do Google: `main.tsx` chama `google.finish(location.search)` em qualquer página; se houver retorno, `history.replaceState(null, '', '/conta')` e monta o `App`.
  - `<title>`: "Good Gamë" na home, "Privacidade · Good Gamë" na privacidade.

- [ ] **Step 1: Write the failing test** — `pageFor` com `/`, `/tv`, `/tv?demo`, `/privacidade`, `/conta`, `/painel`, `/qualquer`.
- [ ] **Step 2: Run** `npx vitest run apps/web/test/routes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `routes.ts`, as duas páginas e o `main.tsx`.
- [ ] **Step 4: Run** `npm run check` — Expected: PASS.
- [ ] **Step 5: Verify** com `npm run build -w @tom/web` + `npx vite preview -c apps/web/vite.config.ts` (o navegador sem janela bloqueia o HMR do `web:dev`) e a skill `browser-automation`: `/` mostra a loja e "Entrar", que leva a `/conta` com a tela de login; `/privacidade` mostra o canal do Instagram; `/?error=access_denied&state=x` termina em `/conta` com "Entrada pelo Google cancelada."; sem erro no console. Pare o `vite preview` e confira a porta livre.
- [ ] **Step 6: Commit** — `feat: home pública da Good Gamë e página de privacidade`

### Task 5: Telas de Player ID do jogador e do ADM

**Files:**
- Create: `apps/web/src/screens/player-id.tsx` (jogador informa o Player ID), `apps/web/src/screens/unlink.tsx` (ADM desfaz vínculo)
- Modify: `apps/web/src/screens/home.tsx`, `apps/web/src/screens/register.tsx`, `apps/web/src/api.ts`
- Delete: `apps/web/src/screens/checkin.tsx` (se ainda existir)

**Interfaces:**
- Consumes: `POST /me/player-id`, `GET /player-ids/{pid}`, `POST /player-ids/{pid}/unlink` (Tarefa 3).
- Produces em `apps/web/src/api.ts`: `claimPlayerId(playerId: string): Promise<ApiResult<MeResponse>>`, `accountByPlayerId(playerId: string): Promise<ApiResult<AccountResponse>>`, `unlinkPlayerId(playerId: string): Promise<ApiResult<AccountResponse>>`.

Comportamento:
- Home do jogador: com Player ID, `Player ID 100001. Você já pode reportar resultados.`; sem Player ID, cartão **"Informe seu Player ID"** com o campo e o botão "Salvar", e o erro da API em `role="alert"`. Sai o aviso "Check-in pendente" e o código da conta.
- ADM: cartão **"Desfazer vínculo de Player ID"** no lugar do check-in: campo Player ID → "Buscar" mostra nome e e-mail → botão "Desfazer vínculo" pede confirmação (`confirm('Tirar o Player ID 100001 de Ana Souza? A pessoa precisará informar outro Player ID.')`) → mensagem `Vínculo desfeito. O dono do Player ID já pode cadastrá-lo.`
- Cadastro: o texto de dados ganha o link **"Política de privacidade"** para `/privacidade`; o campo Player ID ganha a dica "Obrigatório para jogar".

- [ ] **Step 1: Implement** as telas e as funções da API do site.
- [ ] **Step 2: Run** `npm run check` — Expected: PASS.
- [ ] **Step 3: Verify** com o `vite preview` e a skill `browser-automation` (sem login de verdade: confira que `/conta` monta e que nenhum texto "Check-in pendente" existe no build: `grep -r "Check-in pendente" apps/web/dist` sem resultado).
- [ ] **Step 4: Commit** — `feat: jogador informa o Player ID e ADM desfaz vínculo`

### Task 6: Teste real, documentação e deploy

**Files:**
- Modify: `apps/api/test/api.aws.test.ts`, `README.md`, `docs/spec-tom.md`

- [ ] **Step 1: AWS test** — troque o teste "check-in: o ADM confirma o Player ID" por `Player ID vale no cadastro; ADM desfaz o vínculo e o dono cadastra`: jogador cadastra com Player ID único (`String(Date.now())`) → `canAct: true`; segundo usuário com o mesmo Player ID → 409 `player_id_taken`; ADM `POST /player-ids/<pid>/unlink` → 200; segundo usuário `POST /me/player-id` com o mesmo → 200 (a trava foi liberada de verdade no DynamoDB).
- [ ] **Step 2: Deploy de teste** — o usuário roda no PowerShell: `cd infra; npx cdk deploy TomApiTest --profile tom` (sem IAM novo).
- [ ] **Step 3: Run** `npm run test:aws` — Expected: PASS.
- [ ] **Step 4: Docs** — README: tabela de rotas (saem as de `/accounts`, entram `POST /me/player-id`, `GET /player-ids/{pid}`, `POST /player-ids/{pid}/unlink`), estrutura do site (`/` home pública, `/privacidade`, `/conta`, `/tv`, `/painel`), fase 6 sem "check-in do ADM". `docs/spec-tom.md`: fluxo do evento (passo 2 sem confirmação do ADM), "Conta e Player ID" (trava no cadastro, "Desfazer vínculo"), tabela de papéis (sai "Confirmar Player ID no check-in", entra "Desfazer vínculo de Player ID") e a revisão 5 no registro de decisões.
- [ ] **Step 5: Deploy de produção** — o usuário roda `cd infra; npx cdk deploy TomApi --profile tom`, depois `cd ..; npm run web:deploy`. A conta antiga com Player ID `1122334` (gravada no formato antigo, sem trava) fica sem trava até o ADM desfazer o vínculo e o dono cadastrar de novo; como é conta de teste, basta desfazer.
- [ ] **Step 6: Commit** — `docs: Player ID sem conferência, home pública e privacidade`
