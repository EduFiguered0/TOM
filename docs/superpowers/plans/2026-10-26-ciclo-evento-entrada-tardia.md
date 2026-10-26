# Ciclo do evento e entrada tardia — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a confirmação de presença, manter o QR aberto até o encerramento e fazer quem entra depois da rodada 1 esperar a aprovação do ADM.

**Architecture:** O status `confirming` sai do núcleo, da API e do site. A inscrição troca `confirmed` por `awaitingApproval`; recusar reaproveita `removed` (o removido já vê "procure o ADM" e não volta pelo QR). O quadro da TV em andamento passa a levar o código do QR.

**Tech Stack:** TypeScript, Vitest, Preact + Tailwind, DynamoDB (adaptadores em `packages/aws-adapters`).

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 1).

## Global Constraints

- Estados: `open` → `running` (desde o início da rodada 1) → `final` → `closed`, ou `cancelled`.
- O QR aceita inscrição em `open` e `running`; em `final`, `closed` e `cancelled` responde "Inscrições encerradas".
- Em `running`, inscrição pelo QR nasce com `awaitingApproval: true`; inscrição à mão pelo ADM nunca espera.
- Recusar = remover. O removido que escaneia vê "Sua inscrição foi removida, procure o ADM" (texto atual).
- Evento gravado com status `confirming` é lido como `open`; inscrição gravada sem `awaitingApproval` é lida com `false`.
- Toda ação mostra o erro real da API; sucesso só depois do "ok".
- `npm run check` (typecheck + lint + testes) passa ao fim de cada tarefa.

## Review Focus

- Dois ADMs aprovam/recusam a mesma entrada ao mesmo tempo: o último vence, sem erro (gravação simples, sem guarda).
- O evento vira `final` entre a leitura e a gravação de uma entrada tardia: a guarda `running` recusa com "Inscrições encerradas" (teste na Tarefa 1).
- Jogador aprovado que escaneia de novo: devolve a inscrição, sem voltar a esperar (teste na Tarefa 1).
- Jogador esperando aprovação abre o celular com a rodada em andamento: vê "Aguardando o organizador", não some (teste na Tarefa 3).
- Evento antigo em `confirming` no DynamoDB depois do deploy: aparece como inscrições abertas e a rodada 1 inicia (teste na Tarefa 1).

---

### Task 1: Núcleo — sem confirmação, com entrada tardia

**Files:**
- Modify: `packages/core/src/tournament/tournament-event.ts` (tipo `EventStatus`, `ACTIVE_STATUSES`, comentário das fases)
- Modify: `packages/core/src/tournament/registration.ts` (`confirmed` → `awaitingApproval`)
- Modify: `packages/core/src/tournament/registration-service.ts`
- Modify: `packages/core/src/tournament/event-service.ts` (sai `requestConfirmation`; `markRunning` parte de `open`)
- Modify: `packages/aws-adapters/src/dynamo-event-registry.ts` (`eventFromStored`), `packages/aws-adapters/src/dynamo-registration-repository.ts` (`fromStored`)
- Test: `packages/core/test/tournament/registration-service.test.ts`, `packages/core/test/tournament/event-service.test.ts`, `packages/aws-adapters/test/` (teste de leitura legada, junto dos testes do registro de eventos)

**Interfaces:**
- Produces:
  - `type EventStatus = 'open' | 'running' | 'final' | 'closed' | 'cancelled'`
  - `Registration.awaitingApproval: boolean` (sem `confirmed`)
  - `RegistrationService.join(principal, code)` — `open`: inscreve (guarda `'open'`); `running`: inscreve com `awaitingApproval: true` (guarda `'running'`); outros: `CommandRejected('event_state', 'Inscrições encerradas')`
  - `RegistrationService.approve(actor: Actor | null, eventId: string, accountId: string): Promise<Registration>` — só ADM; põe `awaitingApproval: false`
  - `RegistrationService.awaiting(eventId: string): Promise<number>` — não removidos com `awaitingApproval`
  - Saem: `confirm`, `confirmFor`, `pending`, `EventService.requestConfirmation`
  - `EventService.markRunning(eventId)` — de `['open']` para `'running'`

- [ ] **Step 1: Testes que falham** (substituem os de confirmação em `registration-service.test.ts` e `event-service.test.ts`)

```ts
it('depois da rodada 1, o QR inscreve aguardando o ADM; aprovado, deixa de aguardar', async () => {
  const { service, accounts, events, event, code } = await setup();
  await events.markRunning(event.id);
  const bia = await account(accounts, 'bia', '100002');
  expect((await service.join(bia, code)).registration).toMatchObject({ by: 'self', awaitingApproval: true });
  expect(await service.awaiting(event.id)).toBe(1);
  expect((await service.approve(actors.admin, event.id, 'bia')).awaitingApproval).toBe(false);
  expect((await service.join(bia, code)).registration.awaitingApproval).toBe(false);
  expect(await service.awaiting(event.id)).toBe(0);
});

it('recusar é remover: escanear de novo não reabre o pedido', async () => {
  // markRunning, join (aguardando), service.remove(actors.admin, ...), depois
  await rejects(service.join(bia, code), 'forbidden', 'Sua inscrição foi removida, procure o ADM');
});

it('só o ADM aprova', async () => {
  await rejects(service.approve(ana.actor, event.id, 'bia'), 'forbidden');
});

it('ADM inscreve à mão durante a rodada sem esperar aprovação', async () => {
  // markRunning; service.add(actors.admin, event.id, 'tarde') → awaitingApproval false
});

it('com o resultado final, o QR fecha para quem não estava inscrito', async () => {
  // markRunning; events.markFinal(event.id, []); join de conta nova
  await rejects(service.join(cleo, code), 'event_state', 'Inscrições encerradas');
});
```

Em `event-service.test.ts`: `markRunning` vai de `open` para `running`; de `running` recusa com `'O evento já está em andamento'`.

Para a guarda: em `InMemoryRegistrationRepository`, um teste que muda o evento para `final` entre a leitura e o `put` com guarda `'running'` espera `EventStatusChangedError` → `join` recusa com "Inscrições encerradas" (siga o teste de guarda que já existe para `'open'`).

Leitura legada (adaptadores): `eventFromStored({ ...base, status: 'confirming' }).status` é `'open'`; `fromStored` de uma inscrição com `confirmed: true` e sem `awaitingApproval` devolve `awaitingApproval: false` e não tem `confirmed`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/core packages/aws-adapters/test`
Expected: FAIL (`approve`/`awaiting` não existem; `markRunning` recusa de `open`).

- [ ] **Step 3: Implementar**

`join` escolhe a guarda pelo status lido (`'open'` ou `'running'`) e trata `EventStatusChangedError` como hoje. `add` grava `awaitingApproval: false`. `MANUAL_STATUSES` fica `['open', 'running']`. No adaptador de eventos, o tipo guardado aceita `EventStatus | 'confirming'` e a leitura troca `'confirming'` por `'open'`. No de inscrições, `fromStored` descarta `confirmed` e põe `awaitingApproval ?? false`. Atualize o comentário de `put` no adaptador ("o QR nunca grava fora do status esperado").

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/core packages/aws-adapters/test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(core): sai a confirmação de presença; QR aberto com entrada tardia aguardando o ADM"
```

### Task 2: API e contratos

**Files:**
- Modify: `packages/contracts/src/index.ts` (`EventStatusDto`, `RegistrationDto`, `RegistrationsResponse`, `BoardResponse`, `RoundBoard`)
- Modify: `apps/api/src/api.ts` (rotas e `toRegistration`), `apps/api/src/board.ts`
- Test: `apps/api/test/event.test.ts`, `apps/api/test/board.test.ts`, `apps/api/test/support.ts`, `apps/api/test/api.aws.test.ts`

**Interfaces:**
- Consumes: Tarefa 1 (`approve`, `awaiting`, `markRunning` de `open`)
- Produces:
  - `EventStatusDto = 'open' | 'running' | 'final' | 'closed' | 'cancelled'`
  - `RegistrationDto.awaitingApproval: boolean` (sem `confirmed`)
  - `RegistrationsResponse = { registrations; total; awaiting: number; launched }` — `total` e `launched` não contam removidos nem quem aguarda
  - `POST /events/:id/registrations/:accountId/approve` → `RegistrationDto`; recusar continua `.../remove`
  - `RoundBoard.code: string` (código do QR para o canto da TV)
  - Saem: `POST /events/:id/confirmation`, `POST /me/event/confirm`, `.../registrations/:accountId/confirm`, `BoardResponse` `'confirming'`

- [ ] **Step 1: Testes que falham** (substituem os de confirmação)

```ts
it('rodada 1 inicia direto com o evento aberto e o evento fica em andamento', async () => {
  const ctx = await setupRound();
  expect((await ctx.call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).status).toBe(200);
  expect(((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event?.status).toBe('running');
});

it('entrada tardia: aguarda, aparece no contador, o ADM aprova', async () => {
  // setupRound + start; register 'p9:c9' com Player ID; POST /join/<code> 'p9:c9'
  expect(joined.body).toMatchObject({ registration: { awaitingApproval: true } });
  expect(await list()).toMatchObject({ awaiting: 1 });
  expect((await call('POST', `/events/${id}/registrations/${p9}/approve`, ADM)).body).toMatchObject({ awaitingApproval: false });
  expect(await list()).toMatchObject({ awaiting: 0 });
});

it('só o ADM aprova (403)', async () => { /* approve com token de jogador → 403 */ });

it('rotas de confirmação não existem mais (404)', async () => {
  expect((await call('POST', `/events/${event.id}/confirmation`, ADM)).status).toBe(404);
  expect((await call('POST', '/me/event/confirm', 'ana-email:c1')).status).toBe(404);
});
```

Em `board.test.ts`: o quadro `running` traz `code` igual ao do evento; o teste do estado `confirming` sai. Em `support.ts`, `start` deixa de chamar `/confirmation`. Em `api.aws.test.ts`, o teste de ponta a ponta passa a: QR inscreve, inicia a rodada 1, QR inscreve aguardando (guarda `running` real no DynamoDB), ADM aprova, contadores.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/api`
Expected: FAIL

- [ ] **Step 3: Implementar**

`/round/start`: sem os dois bloqueios; se o evento estiver `open`, chama `markRunning` depois de iniciar. A rota de ações da inscrição aceita `(approve|remove|launched)`. `toRegistration` manda `awaitingApproval`. Em `board.ts`, sai o caso `confirming`, e o caso `running` acrescenta `code: event.code ?? ''`. O comentário de `createBoard` perde "confirmação de presença".

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run apps/api`
Expected: PASS (o `api.aws.test.ts` roda à parte com `npm run test:aws`, contra a AWS, antes do deploy)

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): rodada 1 sem confirmação; aprovar entrada tardia; código do QR no quadro em andamento"
```

### Task 3: Site — painel, celular e TV

**Files:**
- Modify: `apps/web/src/api.ts` (sai `confirmPresence`; `eventAction` sem `'confirmation'`; `registrationAction` com `'approve' | 'remove'`)
- Modify: `apps/web/src/admin/steps.ts` (etapas sem "Confirmação"), `apps/web/src/admin/event-tab.tsx`, `apps/web/src/admin/admin-shell.tsx`
- Modify: `apps/web/src/screens/registrations.tsx`, `apps/web/src/screens/my-event.tsx`
- Modify: `apps/web/src/tv/board.ts` (sai `confirmCall`), `apps/web/src/tv/waiting.tsx`, `apps/web/src/tv/tv.tsx`
- Test: `apps/web/test/admin-steps.test.ts`, `apps/web/test/board.test.ts`, `apps/web/test/my-event-view.test.ts` (criar se não houver; siga `flow.test.ts`)

**Interfaces:**
- Consumes: Tarefa 2 (DTOs e rota `approve`)
- Produces: `eventSteps(status)` com as etapas `['Evento criado', 'Inscrições (QR)', 'Rodadas', 'Resultado final']`; `myEventView(mine: MyEventResponse): 'none' | 'awaiting' | 'removed' | 'placement' | 'ended' | 'waiting-start'` em `apps/web/src/screens/my-event-view.ts` (lógica pura testável; o componente só desenha)

- [ ] **Step 1: Testes que falham**

```ts
// admin-steps.test.ts
expect(states('open')).toEqual(['done', 'now', 'todo', 'todo']);
expect(states('running')).toEqual(['done', 'done', 'now', 'todo']);

// my-event-view.test.ts
it('aguardando aprovação aparece mesmo com a rodada em andamento', () => {
  expect(myEventView({ event: { status: 'running' }, registration: { awaitingApproval: true, removed: false }, placement: null })).toBe('awaiting');
});
it('aprovado com a rodada em andamento: o cartão some (a rodada assume)', () => {
  expect(myEventView({ event: { status: 'running' }, registration: { awaitingApproval: false, removed: false }, placement: null })).toBe('none');
});
```

(Monte os objetos completos com um helper do teste; os campos acima são os que decidem.)

`board.test.ts`: saem os testes de `confirmCall`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run apps/web`
Expected: FAIL

- [ ] **Step 3: Implementar**

Textos fixos:
- Celular aguardando: título "Aguardando o organizador", texto "Sua entrada no {evento} foi pedida. O organizador vai liberar você para o próximo pareamento."
- Aba Evento: a etapa "Inscrições (QR)" perde o botão "Pedir confirmação". Com `awaiting > 0`, um aviso acima dos blocos: "{n} entrada(s) tardia(s) aguardando aprovação", que leva à lista. O contador dos inscritos vira "{total} inscritos · {launched} lançados no TOM".
- Menu lateral: o selo de Inscritos mostra também `+{awaiting}` em laranja quando houver.
- Tabela de inscritos: a coluna "Presença" vira "Situação": para quem aguarda, os botões **Aprovar** e **Recusar**. Recusar pede confirmação ("Recusar a entrada de {nome}?") e chama `remove`. Para os demais, a célula fica vazia. O aviso "Não está nas guias da rodada atual" passa a valer para quem não aguarda.
- "Ir para a rodada" no topo aparece com o evento `running`.
- TV: `waiting.tsx` perde o estado `confirming`. Em `tv.tsx`, o QR (`qrPath` + `joinUrl(origin, board.code)`) fica pequeno no rodapé, à direita, com "Chegou agora? Escaneie para entrar". O layout novo das mesas é da entrega 3.

- [ ] **Step 4: Rodar tudo**

Run: `npm run check`
Expected: PASS

- [ ] **Step 5: Ver no navegador**

Rode `npm run web:dev` contra a API de desenvolvimento e confira com a skill de verificação do navegador. Na aba Evento, as etapas aparecem sem "Confirmação". Uma entrada tardia aparece com Aprovar/Recusar, e o celular mostra "Aguardando o organizador". A TV em andamento mostra o QR no rodapé.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(web): sem confirmação de presença; entrada tardia com Aprovar/Recusar; QR no rodapé da TV"
```

### Task 4: Documentação e PR

**Files:**
- Modify: `README.md` (trecho do dia do evento: tirar "pedir confirmação", explicar a entrada tardia)
- Modify: `docs/superpowers/specs/2026-10-24-eventos-qr-design.md` (nota no topo: confirmação de presença substituída pela spec de 2026-10-26, item 1)

- [ ] **Step 1:** Atualizar os dois textos.
- [ ] **Step 2:** `npm run check` → PASS.
- [ ] **Step 3:** Commit `docs: dia do evento sem confirmação de presença; entrada tardia`, push e PR com base `main`.
