# Convite de juiz por QR — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na guia Equipe, o ADM gera um QR de convite de juiz (só no painel, nunca na TV) que vale 15 minutos e uma única vez; quem escaneia entra (ou se cadastra) e vira juiz da equipe.

**Architecture:** Porta nova `JudgeInviteRepository` (memória e DynamoDB, na tabela `Tournaments`: `pk = invites`, `sk = invite#<código>`, lida com `Query`; uso e cancelamento por `PutItem` condicional, sem permissão nova). `JudgeInviteService` cria, lista, cancela e aceita; aceitar marca a conta como juiz por `AccountService.grantJudge` (ator de sistema `invite:<código>`). No site, `/juiz/<código>` guarda o código como o QR do evento e aceita no fim do login/cadastro.

**Tech Stack:** TypeScript, Vitest, Preact, DynamoDB.

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 7).

## Global Constraints

- Código: 10 caracteres do alfabeto dos QR (sem 0/O, 1/I/L). Vale 15 minutos a partir da criação. Uso único.
- Usado, vencido, cancelado ou inexistente: "Convite já utilizado ou vencido" (código `invite_invalid`, HTTP 410).
- Aceitar exige conta com Player ID (mesma regra de `setJudge`: "O juiz precisa ter Player ID cadastrado"); conta já juiz: aceita e gasta o convite.
- Vários convites abertos ao mesmo tempo; a Equipe lista os abertos com os minutos restantes; o ADM cancela qualquer um.
- O QR do convite nunca aparece na TV (nenhum dado de convite no quadro).
- Só o ADM cria, lista e cancela; qualquer conta logada aceita.

## Review Focus

- Dois celulares escaneiam o mesmo convite ao mesmo tempo: só um vira juiz (teste na Tarefa 1, contrato do repositório).
- Convite aceito aos 14:59 vs 15:01 (teste na Tarefa 1).
- Conta sem Player ID escaneia: recusa e o convite continua valendo (teste na Tarefa 1).
- Convite cancelado não aparece na lista e não é aceito (teste na Tarefa 1).
- Juiz escalado no evento ativo inscrito? Não se aplica: o convite só põe na equipe.

---

### Task 1: Núcleo e repositório
- `JudgeInvite { code; createdBy; createdAt: Date; expiresAt: Date; usedBy: string | null; cancelled: boolean }`
- `JudgeInviteRepository { create(i); get(code); listAll(); markUsed(code, accountId, now): Promise<boolean>; cancel(code): Promise<void> }` — `markUsed` só grava se não usado, não cancelado e `expiresAt > now`
- `JudgeInviteService { create(actor); open(actor); cancel(actor, code); accept(principal, code) }`
- `AccountService.grantJudge(accountId, source: string): Promise<Account>`
- Testes que falham → implementar → commit `feat(core): convite de juiz de uso único que vence em 15 minutos`

### Task 2: API
- `POST /staff/invites` → `{ code, expiresAt }`; `GET /staff/invites` → `{ code, expiresAt }[]`; `POST /staff/invites/{código}/cancel`; `POST /invites/{código}/accept` → `MeResponse`
- Testes → implementar → commit `feat(api): rotas do convite de juiz`

### Task 3: Site
- Equipe: "Gerar convite de juiz", QR (`Qr` da TV) + link para copiar, lista dos abertos com minutos restantes e Cancelar.
- `/juiz/<código>`: guarda o código (como `/e/<código>`), aceita quando a conta tem Player ID e nome conferido; mostra "Você agora é juiz da equipe." ou o erro.
- `npm run check`, build → commit `feat(web): convite de juiz na Equipe e aceite pelo QR`

### Task 4: AWS (`TomApiTest` + `test:aws`), README e PR empilhado sobre a entrega 6
