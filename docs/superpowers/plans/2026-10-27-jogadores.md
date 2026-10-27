# Guia Jogadores — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guia Jogadores lista todos os cadastrados (ordem alfabética), com busca por Player ID, nome ou e-mail, e dados mascarados no servidor; ao abrir um jogador, mostra os eventos com pagamento e o "Desfazer vínculo".

**Architecture:** O núcleo ganha as máscaras (`maskEmail`, `maskPhone`) e `AccountService.players(actor, query)`. A API expõe `GET /players?q=` com `PlayerRowDto` já mascarado; o "Desfazer vínculo" passa a usar essa linha (nunca o e-mail completo). O site troca a guia atual por lista + detalhe.

**Tech Stack:** TypeScript, Vitest, Preact.

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 6).

## Global Constraints

- Colunas, mascaradas no servidor: Player ID completo; só o primeiro nome; e-mail com os 3 primeiros caracteres + `•••` + `@domínio` (`duk•••@gmail.com`; com menos de 3 caracteres antes do `@`, mostra os que houver); telefone só com os 4 últimos (`•••• 1234`; sem telefone, vazio). Ano de nascimento não aparece.
- Busca no servidor sobre os dados completos: só dígitos = Player ID que começa com o texto; senão parte do nome completo (sem acento nem maiúsculas) ou do e-mail. Sem texto: todos. No máximo 200 linhas, em ordem alfabética do nome completo.
- O navegador do ADM nunca recebe e-mail, telefone ou nome completo nesta guia (inclusive no "Desfazer vínculo").
- Só o ADM.
- `npm run check` passa ao fim de cada tarefa.

## Review Focus

- E-mail curto (`ab@x.com`): máscara não quebra (teste na Tarefa 1).
- Busca "silva" acha pelo sobrenome; "gmail" acha pelo e-mail (teste na Tarefa 1).
- Conta sem Player ID aparece na lista (com o Player ID vazio) (teste na Tarefa 1).
- Jogador pede `/players`: 403 (teste na Tarefa 2).
- Resposta de `/players` não contém o e-mail completo nem o sobrenome (teste na Tarefa 2).

---

### Task 1: Núcleo

**Files:** Create `packages/core/src/identity/mask.ts` (+ export); Modify `packages/core/src/identity/account-service.ts` (`players`). Test: `packages/core/test/identity/mask.test.ts`, `account-service.test.ts`.

**Interfaces:**
- `maskEmail(email: string): string`; `maskPhone(phone: string | null): string | null`
- `AccountService.players(actor: Actor | null, query: string): Promise<Account[]>` (só ADM; regras acima)

- [ ] Testes que falham → implementar → `npx vitest run packages/core` PASS → commit `feat(core): máscaras e lista de jogadores com busca`

### Task 2: API

**Files:** `packages/contracts/src/index.ts` (`PlayerRowDto { id; playerId: string | null; firstName; email; phone: string | null }`), `apps/api/src/api.ts` (`GET /players?q=`; `GET /player-ids/{pid}` passa a devolver `PlayerRowDto`).

- [ ] Testes que falham (lista mascarada, busca, 403, sem e-mail completo) → implementar → `npx vitest run apps/api packages/contracts` PASS → commit `feat(api): lista de jogadores mascarada`

### Task 3: Site

**Files:** Create `apps/web/src/screens/players.tsx` (lista + busca + detalhe com eventos e "Desfazer vínculo"); Modify `apps/web/src/admin/admin-shell.tsx` (guia usa a tela nova), `apps/web/src/api.ts` (`players`, `accountByPlayerId` com o tipo novo); remove `apps/web/src/screens/unlink.tsx`.

- [ ] `npm run check` PASS, build sem erro → commit `feat(web): guia Jogadores com lista, busca, eventos e pagamento`

### Task 4: README e PR (empilhado sobre a entrega 5)
