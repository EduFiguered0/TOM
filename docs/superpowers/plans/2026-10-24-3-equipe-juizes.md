# Equipe e juízes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o juiz deixa de ser grupo do Cognito e vira uma marca na conta, posta pelo ADM na página "Equipe"; ele só age no evento em que o ADM o escalou, e nunca joga esse evento.

**Architecture:** `Account.judge` (marca permanente) + `TournamentEvent.judges` (escala por evento, ids de conta). Uma função pura do domínio, `staffActor`, decide quem age no painel: ADM sempre; juiz só com a marca **e** escalado no evento atual. Até o plano 4 criar o "evento ativo", o **evento atual** é o da rodada publicada (`registry.current().eventId`).

**Tech Stack:** TypeScript, Preact, Vitest, DynamoDB (tabelas `Accounts` e `Events` existentes), Cognito.

**Spec:** `docs/superpowers/specs/2026-10-24-eventos-qr-design.md` (seções "Papéis", "Telas" → Juiz e Equipe, "o que não pode acontecer"); base em `docs/spec-tom.md`.

Plano 3 de 5 (antes: login; Player ID e home pública. Depois: ciclo do evento com QR; histórico).

## Global Constraints

- Região us-east-2, perfil `tom`. Nenhum recurso AWS novo; sai o grupo `judge` do Cognito (vazio em produção e em teste, conferido em 2026-10-24). Custo: a busca da Equipe lê a tabela `Accounts` inteira (Scan). Com centenas de itens isso custa menos de US$ 0,0001 por busca.
- "Ser juiz da equipe não dá poder nenhum sozinho: o juiz só age nos eventos em que foi escalado pelo ADM."
- "Juiz pode jogar, mas nunca no evento em que está escalado." Neste plano: juiz escalado no evento atual não reporta (a recusa na inscrição pelo QR fica no plano 4).
- "Juiz e jogador usam a mesma conta. Ao entrar, o juiz vê duas áreas: 'Jogador' e 'Juiz'."
- O juiz precisa de Player ID (é uma conta de jogador). ADM continua sendo grupo `admin` do Cognito e não precisa de Player ID.
- Mensagens exatas:
  - `Só juízes da equipe podem ser escalados`
  - `O juiz precisa ter Player ID cadastrado`
  - `Você é juiz deste evento`
  - `Só o ADM e os juízes escalados no evento usam o painel`
- Textos em pt-BR. `npm run check` verde ao fim de cada tarefa.
- Deploy: o usuário roda no PowerShell, a partir de `infra`: `npx cdk deploy <stacks> --profile tom`.

## Review Focus

1. Juiz tirado da equipe no meio do evento perde o painel na hora (mesmo continuando escalado). → teste na Tarefa 2.
2. Juiz escalado num evento antigo, mas não no atual, recebe 403 no painel. → teste na Tarefa 3.
3. Evento gravado antes deste plano (sem `judges`) é lido com escala vazia. → teste na Tarefa 2.
4. Busca por nome ignora acento e maiúsculas ("joao" acha "João Silva"); só dígitos busca por Player ID exato. → teste na Tarefa 1.
5. Juiz escalado no evento atual tenta reportar pela própria mesa: 403 "Você é juiz deste evento". → teste na Tarefa 3.

---

### Task 1: Marca de juiz na conta e busca da Equipe

**Files:**
- Modify: `packages/core/src/identity/account.ts`, `account-repository.ts`, `in-memory-account-repository.ts`, `account-service.ts`, `packages/aws-adapters/src/dynamo-account-repository.ts`
- Test: `packages/core/test/identity/account-service.test.ts`, `packages/core/test/identity/account-repository-contract.ts`

**Interfaces:**
- Produces:
  - `Account.judge?: boolean`: ausente = `false`.
  - Evento `{ type: 'judge_set'; judge: boolean }`, gravado com o ADM como `actor`.
  - Porta: `all(): Promise<Account[]>`. Dynamo: `Scan` paginado com filtro `sk = 'account'`, convertendo cada item por `fromStored`.
  - `AccountService.setJudge(actor: Actor | null, accountId: string, judge: boolean): Promise<Account>`:
    - Só o ADM.
    - Marcar sem Player ID → `invalid_input` com `O juiz precisa ter Player ID cadastrado`.
    - Sem mudança não grava.
  - `AccountService.search(actor: Actor | null, query: string): Promise<Account[]>`:
    - Só o ADM.
    - `query` aparado com menos de 2 caracteres → `invalid_input` com `Digite pelo menos 2 caracteres`.
    - Só dígitos → Player ID exato.
    - Senão, o nome contém o texto, sem acento e sem diferença de maiúsculas (`normalize('NFD')` sem marcas combinantes, `toLowerCase`).
    - Ordem por nome, no máximo 20.
  - `AccountService.listJudges(actor: Actor | null): Promise<Account[]>`: só o ADM; contas com `judge === true`, por nome.
  - `actorFor` deixa de ler o grupo `judge`: só `admin` vira ADM; o resto é jogador (com Player ID) ou `null`.

- [ ] **Step 1: Write the failing tests**
  - Contrato: `all devolve as contas gravadas` (grava 2 e confere que as duas estão em `all()` pelo id).
  - Serviço:
    - `ADM marca e desmarca juiz; fica registrado`: `setJudge(admin, id, true)` → `judge: true`, último evento `{ type: 'judge_set', judge: true, actor: admin }`; repetir não grava evento novo.
    - `juiz precisa de Player ID`: conta sem Player ID → `invalid_input` com a mensagem.
    - `só o ADM mexe na equipe`: jogador → `forbidden` em `setJudge`, `search` e `listJudges`.
    - `busca por nome sem acento e por Player ID exato`: contas "João Silva" (100001) e "Maria Joana" (100002). `search(admin, 'joao')` → só João; `search(admin, 'JO')` → as duas, João primeiro; `search(admin, '100002')` → só Maria; `search(admin, '1000')` → nenhuma; `search(admin, ' a ')` → `invalid_input`.
    - `lista os juízes da equipe`: depois de marcar João, `listJudges(admin)` → `[João]`.
    - Troque o teste `grupos do Cognito definem juiz e ADM` por `grupo admin do Cognito define o ADM; o grupo judge não vale mais`: `groups: ['judge']` com Player ID → `role: 'player'`; `['admin']` → `admin`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/identity` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run packages` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: marca de juiz na conta e busca da equipe`

### Task 2: Escala de juízes no evento e quem age no painel

**Files:**
- Create: `packages/core/src/tournament/staff.ts`
- Modify: `packages/core/src/tournament/tournament-event.ts`, `event-service.ts`, `index.ts`, `packages/aws-adapters/src/dynamo-event-registry.ts`
- Test: `packages/core/test/tournament/event-service.test.ts`, `packages/core/test/tournament/staff.test.ts`, `packages/aws-adapters/test/dynamo-event-registry.test.ts` (offline, novo)

**Interfaces:**
- Consumes: `Account.judge`, `AccountRepository.get` (Tarefa 1).
- Produces:
  - `TournamentEvent.judges: string[]` (ids de conta). `fromStored` do registro DynamoDB, agora exportada, lê `judges` ausente como `[]`.
  - `EventServiceDeps.accounts: AccountRepository`.
  - `EventService.createEvent(actor: Actor | null, label: string, judges: readonly string[] = [])`.
  - `EventService.setJudges(actor: Actor | null, eventId: string, judges: readonly string[]): Promise<TournamentEvent>`:
    - Só o ADM.
    - Sem repetidos.
    - Cada id precisa ser conta com `judge === true`; senão `invalid_input` com `Só juízes da equipe podem ser escalados`.
    - Evento inexistente → `event_not_found`.
  - `staffActor(principal: Principal, event: TournamentEvent | null): Actor | null` em `staff.ts`:
    - ADM → o ator dele.
    - `account.judge === true` e `event?.judges.includes(account.id)` → `{ role: 'judge', accountId }`.
    - Senão → `null`.

- [ ] **Step 1: Write the failing tests**
  - `event-service.test.ts`:
    - `cria com juízes da equipe`: conta marcada, `createEvent(admin, 'Liga', [id])` → `judges: [id]`.
    - `recusa escalar quem não é juiz da equipe`: com a mensagem exata, e o evento não é gravado.
    - `ADM troca a escala; repetidos viram um`: `setJudges(admin, ev, [id, id])` → `judges: [id]`.
    - `só o ADM escala`: jogador → `forbidden`.
    - Os testes atuais passam o `InMemoryAccountRepository` nas deps.
  - `staff.test.ts`:
    - `ADM sempre age`.
    - `juiz da equipe escalado age como juiz`.
    - `juiz da equipe não escalado não age`.
    - `escalado mas tirado da equipe não age` (Review Focus 1).
    - `sem evento atual, só o ADM`.
  - `dynamo-event-registry.test.ts`: `fromStored({ ...stored sem judges })` → `judges: []`, e `createdAt` vira `Date`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/tournament packages/aws-adapters/test/dynamo-event-registry.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**:
  - Ajuste o `apps/api/src/handler.ts` e o `apps/api/test/support.ts`, que montam o `EventService`, para passar `accounts`.
- [ ] **Step 4: Run** `npx vitest run packages` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: escala de juízes por evento`

### Task 3: Contratos e rotas da API

**Files:**
- Modify: `packages/contracts/src/index.ts`, `apps/api/src/api.ts`, `apps/api/test/support.ts`
- Test: `apps/api/test/staff.test.ts` (novo), `apps/api/test/panel.test.ts`, `apps/api/test/api.test.ts`, `apps/api/test/round.test.ts`, `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: Tarefas 1 e 2.
- Produces:
  - `AccountResponse.judge: boolean`.
  - `MeResponse`:
    - `role: 'player' | 'admin'`; sai `'judge'`.
    - `judge: boolean`: marca da equipe.
    - `judging: boolean`: `staffActor` é juiz no evento atual.
  - Requisições:
    - `SearchRequest { query: string }` (`parseSearchRequest`).
    - `SetJudgeRequest { judge: boolean }` (`parseSetJudgeRequest`).
    - `JudgesRequest { judges: string[] }` (`parseJudgesRequest`: lista de strings, até 20).
    - `CreateEventRequest.judges?: string[]`: ausente = `[]`.
  - Rotas, todas só ADM, menos o painel:
    - `POST /staff/search`: corpo `SearchRequest`; devolve `AccountResponse[]`.
    - `GET /staff/judges`: devolve `AccountResponse[]`.
    - `POST /staff/accounts/{id}/judge`: `{id}` = UUID; corpo `SetJudgeRequest`; devolve `AccountResponse`.
    - `PUT /events/{id}/judges`: corpo `JudgesRequest`; devolve `{ id, label, judges }`.
    - `POST /events` aceita `judges`.
  - Evento atual: `const current = await registry.current(); const event = current ? (await registry.get(current.eventId))?.event ?? null : null`. Um helper `currentEvent()` em `createApi`.
  - Painel (`staff()`): `staffActor(principal, await currentEvent())`; `null` → 403 com `Só o ADM e os juízes escalados no evento usam o painel`.
  - `POST /round/report`: se `staffActor` der juiz → 403 com `Você é juiz deste evento`, antes da checagem de jogador.
  - `support.ts`: helper `addJudge(ctx, token: string, playerId: string): Promise<string>`:
    - cadastra a conta;
    - o ADM marca pela rota;
    - o ADM escala pela rota no evento de `withEvent`;
    - devolve o id da conta.
    - Os tokens `'...:judge'` dos testes saem.

- [ ] **Step 1: Write the failing tests** (`staff.test.ts`):
  - `ADM busca, marca juiz e lista a equipe; jogador recebe 403`.
  - `marcar juiz sem Player ID dá 400 com a mensagem`.
  - `escala só aceita juiz da equipe` (400 com a mensagem).
  - `GET /me mostra judge e judging`: marcado e não escalado → `judge: true, judging: false`; escalado no evento da rodada publicada → `judging: true`.
  - `panel.test.ts`:
    - Troque `'juiz:j1:judge'` pelo juiz do `addJudge`.
    - Novo: `juiz escalado em outro evento não usa o painel`: outro evento criado e escalado, a rodada publicada é do primeiro → 403 com a mensagem.
    - Novo: `juiz tirado da equipe perde o painel na hora`.
  - `round.test.ts`: `juiz escalado não reporta pela própria mesa`: o juiz é o `p1` das guias → 403 com `Você é juiz deste evento`.
  - `api.test.ts`: o 403 de unlink usa um jogador comum no lugar de `:judge`.
- [ ] **Step 2: Run** `npx vitest run apps/api packages/contracts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS. Para o `apps/web` compilar:
  - o `ROLE` de `home.tsx` perde `judge`;
  - o `PanelScreen` abre para `me.role === 'admin' || me.judging`.
- [ ] **Step 5: Commit** — `feat: rotas da equipe e painel só para juiz escalado`

### Task 4: Telas da Equipe, da escala e das áreas

**Files:**
- Create: `apps/web/src/screens/team.tsx`
- Modify: `apps/web/src/screens/home.tsx`, `apps/web/src/screens/event.tsx`, `apps/web/src/app.tsx`, `apps/web/src/api.ts`

**Interfaces:**
- Consumes: as rotas da Tarefa 3.
- Produces em `api.ts`:
  - `searchAccounts(query: string): Promise<ApiResult<AccountResponse[]>>`
  - `judges(): Promise<ApiResult<AccountResponse[]>>`
  - `setJudge(accountId: string, judge: boolean): Promise<ApiResult<AccountResponse>>`
  - `setEventJudges(eventId: string, judges: string[]): Promise<ApiResult<{ id: string; label: string; judges: string[] }>>`
  - `createEvent(label: string, judges: string[])`.

Comportamento:
- **Home, área "Jogador"** (todo mundo que não é ADM): igual a hoje.
- **Área "Juiz"** (cartão abaixo, só com `me.judge`):
  - Título "Juiz".
  - Com `me.judging`: botão "Abrir o painel da rodada" (`/painel`).
  - Sem `me.judging`: `Você não está escalado no evento atual.`
- **ADM:**
  - O cartão **"Equipe"** fica no lugar do atual "Desfazer vínculo". O cartão de desfazer vínculo continua, logo abaixo.
  - Campo "Buscar por nome ou Player ID" + "Buscar".
  - Cada resultado mostra nome, Player ID e e-mail, com o botão "Marcar como juiz" ou "Tirar da equipe".
  - Abaixo, a lista "Juízes da equipe" (`judges()`), com "Tirar da equipe".
  - Erros da API em `role="alert"`.
- **Evento do dia** (`event.tsx`):
  - O formulário de criação lista os juízes da equipe com caixas de marcar ("Juízes escalados").
  - Depois de criado, as mesmas caixas e o botão "Salvar juízes" (`setEventJudges`), com `Juízes salvos.` em `role="status"`.
  - Sem juízes na equipe: `Nenhum juiz na equipe. Marque na Equipe.`
- **Painel:** o link do cabeçalho do painel continua em `/conta`.

- [ ] **Step 1: Implement** as telas e as funções da API do site.
- [ ] **Step 2: Run** `npm run check` — Expected: PASS.
- [ ] **Step 3: Verify** com `npm run build -w @tom/web` e `npx vite preview --port 4173 --strictPort`, rodado de dentro de `apps/web`. Use a skill `browser-automation` com a API simulada por `page.route`:
  - O ADM busca "joao", marca como juiz, e "Juízes da equipe" passa a mostrá-lo.
  - A criação do evento lista o juiz.
  - Um jogador com `judge: true, judging: false` vê "Você não está escalado no evento atual."; com `judging: true`, vê o botão do painel.
  - Sem erro no console.
  - No fim, pare o preview e confira a porta 4173 livre; mate o node órfão se preciso.
- [ ] **Step 4: Commit** — `feat: telas da equipe, escala de juízes e área do juiz`

### Task 5: Cognito sem o grupo judge, teste real, documentação e deploy

**Files:**
- Modify: `infra/src/auth-stack.ts`, `infra/test/auth-stack.test.ts`, `apps/api/test/api.aws.test.ts`, `README.md`, `docs/spec-tom.md`

- [ ] **Step 1: Write the failing test**: em `auth-stack.test.ts`, `só o grupo admin` → `resourceCountIs('AWS::Cognito::UserPoolGroup', 1)` com `GroupName: 'admin'`.
- [ ] **Step 2: Run** `npx vitest run infra/test/auth-stack.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `ROLE_GROUPS = ['admin'] as const` e atualize o comentário.
- [ ] **Step 4: AWS test**: `equipe: ADM marca juiz, escala no evento e desmarca`. Use o ADM e o jogador do arquivo (o jogador recebe um Player ID único com `POST /me/player-id`):
  - busca pelo Player ID → 200 com a conta;
  - marca → `judge: true`;
  - `POST /events` com `judges: [id]` → 201;
  - `GET /staff/judges` contém o id;
  - desmarca → `judge: false`.
- [ ] **Step 5: Docs**:
  - README:
    - tabela de rotas, com as quatro novas e o painel "juiz escalado, ADM";
    - a linha do `TomAuth` passa a dizer só o grupo `admin`;
    - "Papéis" diz que juiz se marca na Equipe do site.
  - `docs/spec-tom.md`:
    - tabela de papéis: juiz só no evento escalado;
    - "Equipe" na tela do ADM;
    - Revisão 6 no registro de decisões: "Juiz era grupo do Cognito → marca na conta + escala por evento".
- [ ] **Step 6: Deploy de teste** — o usuário roda `npx cdk deploy TomAuthTest TomApiTest --profile tom` (sai um grupo do Cognito; sem IAM novo) e eu rodo `npm run test:aws` — Expected: PASS.
- [ ] **Step 7: Commit** — `feat: Cognito só com o grupo admin; docs da equipe`
- [ ] **Step 8: Deploy de produção** — o usuário roda `npx cdk deploy TomAuth TomApi --profile tom` e depois, na raiz, `npm run web:deploy`.
