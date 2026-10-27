# Painel do ADM e trava do jogador — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar resultado sem motivo, configuração do evento sem botão Salvar, rodada padrão de 50 min, nome do evento sempre o do TOM e jogador travado depois de reportar.

**Architecture:** Mudanças pequenas no núcleo (`applyOverride` aceita motivo vazio, `DEFAULT_ROUND_MINUTES = 50`, `bind` corrige o nome, `submitReport` recusa segundo reporte do mesmo jogador) e no site (formulário grava sozinho, campo Motivo sai, tela do jogador mostra "Resultado enviado").

**Tech Stack:** TypeScript, Vitest, Preact.

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 4).

## Global Constraints

- Motivo do ajuste: opcional (vazio permitido); a auditoria continua com autor e horário.
- Tempo de rodada padrão: 50 minutos (criação sem tempo e eventos antigos sem o campo).
- Nome do evento: a cada envio do TOM, se o nome do torneio for diferente do nome do evento, o evento passa a usar o do TOM.
- Jogador: um reporte por mesa; o segundo do mesmo jogador é recusado com "Você já reportou esta mesa. Para corrigir, chame o juiz." (código `table_locked`). O ADM (reporte por jogador sem celular) e o override continuam podendo corrigir.
- Configuração: tempo de rodada grava ao sair do campo (só se mudou e é válido); cada juiz grava ao marcar/desmarcar; aviso "Salvo." ou o erro real.
- `npm run check` passa ao fim de cada tarefa.

## Review Focus

- Jogador reporta, a mesa fica vermelha (divergente): ele não consegue corrigir sozinho; o juiz resolve (teste na Tarefa 1).
- ADM corrige o reporte de um lado que já reportou: continua permitido (teste na Tarefa 1).
- Nome do TOM chega igual ao digitado: nada é regravado (teste na Tarefa 1).
- Tempo de rodada inválido no campo (ex.: 5): mostra o erro e não grava (teste na Tarefa 2, pela API que já valida).
- Juiz marcado que já está inscrito: o erro real da API aparece e a caixa volta ao estado salvo.

---

### Task 1: Núcleo e API

**Files:**
- Modify: `packages/core/src/results/deadline.ts` (`DEFAULT_ROUND_MINUTES = 50`), `packages/core/src/tournament/round-service.ts` (`applyOverride`, `submitReport`), `packages/core/src/tournament/event-service.ts` (`bind`)
- Modify: `packages/contracts/src/index.ts` (`parseOverrideRequest`: `reason` opcional, padrão `''`; comentários "30 minutos" → 50), `apps/api/src/api.ts` (`myRound`: `locked` também quando o próprio lado já reportou)
- Test: `packages/core/test/tournament/round-service.test.ts`, `packages/core/test/tournament/event-service.test.ts`, `apps/api/test/round.test.ts`, `apps/api/test/panel.test.ts`, `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Produces: `RoundService.applyOverride(actor, ref, { table, override, reason?: string })`; `MyRoundResponse` seat `locked: true` depois do próprio reporte

- [ ] **Step 1: Testes que falham**

```ts
it('jogador reporta uma vez só; o ADM ainda corrige o lado', async () => {
  // reporte p1 → segundo reporte p1 → CommandRejected 'table_locked', mensagem 'Você já reportou esta mesa. Para corrigir, chame o juiz.'
  // ADM reporta pelo player1 com side → aceito
});
it('ajuste sem motivo é aceito', async () => { /* applyOverride sem reason → mesa verde, override.reason '' */ });
it('evento sem tempo nasce com 50 minutos', async () => { /* createEvent sem roundMinutes → 50 */ });
it('o nome do evento passa a ser o do TOM; igual não regrava', async () => {
  // createEvent label 'Liga' → authorizeUpload(token, 'FODASE') → label 'FODASE'; versão não muda num segundo envio
});
```

API: `POST /round/report` duas vezes pelo mesmo jogador → 409 com a mensagem; `/round/me` depois do reporte → `locked: true`. Override sem `reason` → 200.

- [ ] **Step 2:** `npx vitest run packages apps/api` → FAIL
- [ ] **Step 3:** Implementar. Trava: em `submitReport`, se `actor.role === 'player'` e `table.reports[side]` existe → recusa.
- [ ] **Step 4:** mesmo comando → PASS
- [ ] **Step 5: Commit** — `feat: rodada padrão de 50 min, ajuste sem motivo, nome do evento do TOM e um reporte por jogador`

### Task 2: Site

**Files:**
- Modify: `apps/web/src/panel/table-detail.tsx` (sai o campo Motivo; o detalhe mostra o motivo só se houver), `apps/web/src/api.ts` (`override` sem `reason`)
- Modify: `apps/web/src/screens/event-panel.tsx` (sai o Salvar; grava ao sair do campo e ao marcar juiz; padrão 50 na criação)
- Modify: `apps/web/src/round/round-card.tsx` (depois do reporte: "Resultado enviado: {resumo}. Para corrigir, chame o juiz." e sem os botões)
- Test: `apps/web/test/round.test.ts` (se a regra do cartão estiver em `round.ts`)

- [ ] **Step 1:** Ajustar; `npm run check` → PASS
- [ ] **Step 2:** Build + preview sem erro no console.
- [ ] **Step 3: Commit** — `feat(web): ajuste sem motivo, configuração grava sozinha e tela do jogador travada depois do reporte`
- [ ] **Step 4:** README (rodada padrão 50 min, reporte único), push e PR empilhado sobre a entrega 3.
