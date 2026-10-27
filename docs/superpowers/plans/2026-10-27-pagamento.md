# Pagamento por evento — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ADM marca quem pagou em cada evento; isso fica no cadastro do jogador (evento, data, pago) e só o ADM vê.

**Architecture:** A inscrição ganha `paid`. O repositório de inscrições grava também um índice por conta (`player#<conta>` / `reg#<evento>`, na mesma tabela `Tournaments`, que já tem `Query`), para listar os eventos de um jogador sem `Scan` nem permissão nova. A API expõe a marcação e o histórico; o site mostra a coluna "Pago", o contador e o aviso ao encerrar. A lista no cadastro do jogador aparece na guia Jogadores (entrega 6).

**Tech Stack:** TypeScript, Vitest, Preact, DynamoDB.

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 5).

## Global Constraints

- Inscrição começa "Não pago"; o ADM troca a qualquer momento até o encerramento (`open`, `running`, `final`); depois, recusa com "Evento encerrado: o pagamento não muda mais".
- Não bloqueia nada. Ao encerrar, com inscritos sem pagamento (não removidos, não aguardando aprovação), o painel pergunta "{n} inscrito(s) sem pagamento. Encerrar mesmo assim?".
- Só o ADM vê o pagamento: o `RegistrationDto` vai só para o ADM; `/me/event` do jogador não leva `paid`.
- Histórico do jogador: eventos onde a conta está inscrita (não removida), com nome do evento, data e pago, do mais recente para o mais antigo. Inscrições de antes desta entrega não têm o índice e não aparecem (aceito).
- `npm run check` passa ao fim de cada tarefa.

## Review Focus

- Dois ADMs marcando pago na mesma inscrição: o último vence, sem erro.
- Inscrição removida e depois reinscrita: o histórico mostra o evento uma vez só (teste na Tarefa 1).
- Jogador pede o próprio `/me/event`: não recebe `paid` (teste na Tarefa 2).
- Encerrar sem nenhum inscrito: não pergunta nada.
- Nome do evento trocado pelo TOM depois da inscrição: o histórico mostra o nome atual (lido do evento).

---

### Task 1: Núcleo e repositório

**Files:**
- Modify: `packages/core/src/tournament/registration.ts` (`paid`, porta `listByAccount`), `in-memory-registration-repository.ts`, `registration-service.ts` (`setPaid`, `history`)
- Modify: `packages/aws-adapters/src/dynamo-registration-repository.ts` (grava o índice junto, nas duas formas de `put`; `listByAccount` por `Query`; leitura antiga `paid ?? false`)
- Test: `packages/core/test/tournament/registration-service.test.ts`, `registration-repository-contract.ts` (roda também contra o DynamoDB no `test:aws`), `packages/aws-adapters/test/dynamo-registration-repository.test.ts`

**Interfaces:**
- Produces:
  - `Registration.paid: boolean`
  - `RegistrationRepository.listByAccount(accountId: string): Promise<Registration[]>`
  - `RegistrationService.setPaid(actor: Actor | null, eventId: string, accountId: string, paid: boolean): Promise<Registration>`
  - `RegistrationService.history(actor: Actor | null, accountId: string): Promise<{ eventId: string; label: string; date: string; paid: boolean }[]>` — só ADM

- [ ] **Step 1: Testes que falham** — contrato: `listByAccount` devolve as inscrições da conta em vários eventos e ignora outras contas; regravar a mesma inscrição não duplica. Serviço: nasce `paid: false`; `setPaid` só ADM, só até o encerramento; `history` em ordem de data decrescente, sem removidas, com o nome atual do evento.
- [ ] **Step 2:** `npx vitest run packages` → FAIL
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** mesmo comando → PASS
- [ ] **Step 5: Commit** — `feat(core): pagamento por inscrição e histórico de eventos por jogador`

### Task 2: API

**Files:** `packages/contracts/src/index.ts` (`RegistrationDto.paid`, `RegistrationsResponse.paid`, `PlayerEventDto`, `parseSetPaidRequest`), `apps/api/src/api.ts`
- `POST /events/{id}/registrations/{conta}/paid` com `{ paid: boolean }` → `RegistrationDto` (ADM)
- `GET /accounts/{id}/events` → `PlayerEventDto[]` (ADM)
- `RegistrationsResponse.paid`: inscritos (não removidos, não aguardando) que pagaram
- `/me/event` e `/join` do jogador: `RegistrationDto` sem `paid` (tipo separado `MyRegistrationDto` = `Omit<RegistrationDto, 'paid'>`)

- [ ] Testes que falham → implementar → `npx vitest run apps/api packages/contracts` PASS → commit `feat(api): marcar pagamento e histórico de eventos do jogador`

### Task 3: Site

**Files:** `apps/web/src/screens/registrations.tsx` (coluna "Pago" com caixa por inscrito, inclusive aguardando aprovação), `apps/web/src/admin/event-tab.tsx` (contador "{paid} de {total} pagos"; pergunta ao encerrar), `apps/web/src/api.ts`

- [ ] `npm run check` → PASS; build sem erro → commit `feat(web): coluna Pago, contador e aviso ao encerrar`

### Task 4: AWS, README e PR

- [ ] README (rotas novas, pagamento). Publicar no `TomApiTest`, `npm run test:aws` (o contrato do repositório roda contra o DynamoDB). Commit, push, PR empilhado sobre a entrega 4.
