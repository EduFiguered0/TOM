# Redesenho 2: aba Rodada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aba Rodada sem rolar a página: linha de controle no topo, tabela de mesas e a mesa escolhida ao lado. Vale para o ADM e para o juiz.

**Architecture:** O estado do painel (polling de 5 s, relógio, aba de rodada) sai do `PanelScreen` para o hook `usePanel`. A marcação fica em `RoundTab`, `TablesList` e `TableDetail`, em Tailwind. A escolha da mesa aberta é uma função pura testada. O juiz passa a usar a casca do ADM, só com a aba Rodada.

**Tech Stack:** Preact, Tailwind v4, lucide-preact, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-redesenho-design.md` (seção "Aba Rodada")

## Global Constraints

- As do plano 1 (tema, 1280×720 sem rolar a página, CSP, pt-BR, nada de sucesso falso, só apresentação).
- Nenhuma função some: abas de rodada, keys pendentes, iniciar rodada (formato e minutos), termômetro por cor, relógio, override (placar, ID, DGL, vitória por ausência, com motivo), acréscimo, key lançada, reporte por jogador sem celular, bye.

## Review Focus

- A mesa escolhida sai da rodada (aba trocada ou pareamento novo): o detalhe passa para a primeira mesa que pede ação, sem quebrar.
- Rodada com 20 mesas em 1280×720: a tabela rola por dentro e a página não.
- Juiz: vê só a aba Rodada; sem "Iniciar rodada", sem "Key lançada", sem reporte por jogador (o servidor já recusa).
- Rodada anterior sem início no site: aviso "resolvida direto no TOM" e nenhuma ação na mesa.

---

### Task 1: Mesa aberta

**Files:** Modify `apps/web/src/panel/panel.ts`, `apps/web/test/panel.test.ts`

**Interfaces:** Produces `pickTable(tables: readonly PanelTable[], selected: number | null): number | null`: mantém `selected` se a mesa existe; senão, a primeira de `sortForAction`; sem mesas, `null`.

- [ ] Teste `mesa aberta: mantém a escolhida; senão a primeira que pede ação`: `pickTable([t1 gray, t2 red], 1) === 1`, `pickTable([t1 gray, t2 red], 9) === 2`, `pickTable([t1 gray, t2 red], null) === 2`, `pickTable([], 1) === null`.
- [ ] Rodar: falha. Implementar. Rodar: passa. Commit `feat: escolha da mesa aberta no painel`.

### Task 2: Aba Rodada

**Files:**
- Create: `apps/web/src/panel/use-panel.ts`, `apps/web/src/panel/round-tab.tsx`, `apps/web/src/panel/tables-list.tsx`, `apps/web/src/panel/table-detail.tsx`
- Modify: `apps/web/src/admin/admin-shell.tsx`, `apps/web/src/admin/use-active-event.ts`, `apps/web/src/app.tsx`
- Delete: `apps/web/src/panel/panel-screen.tsx`, `apps/web/src/panel/table-row.tsx`, `apps/web/src/panel/panel.css`, `apps/web/src/round/start-card.tsx`

**Interfaces:**
- Consumes: `pickTable` (Task 1); `sortForAction`, `nextAction`, `describePlayerReport`, `describeOverride` (`panel.ts`); `roundClock` (`tv/board.ts`); `reportOptions` (`round/round.ts`).
- Produces: `usePanel(api: Api): { data: PanelResponse | null; offline: boolean; now: number; skew: number; selected: number | null; open(n: number): void; accept(p: PanelResponse): void }`. `RoundTab({ api, admin }: { api: Api; admin: boolean })`. `useActiveEvent(api: Api, enabled: boolean)`.

- [ ] `usePanel`: a lógica de carga, polling (5 s), relógio (1 s), `skew` e aba de rodada do `PanelScreen` atual, sem mudar.
- [ ] `RoundTab`, linha de cima: abas R1…Rn (só com mais de uma rodada), contagem por cor, avisos (keys pendentes com "Ver rodada N", todas verdes, todas lançadas, rodada só do TOM), relógio e, para o ADM na rodada atual não iniciada, "Iniciar rodada" em linha (formato Melhor de 3/1, minutos vazio = o do evento), usando `api.startRound` e mostrando o erro da API.
- [ ] Embaixo, `grid-cols-[1fr_380px]`: `TablesList` (Mesa, Jogador 1, Jogador 2, Situação com o ponto de cor e `nextAction`, Key; linha clicável e com teclado, `aria-selected`; rola por dentro; bye no rodapé) e `TableDetail` da mesa de `pickTable` (reportes dos dois, override vigente, acréscimo, key; ações com as mesmas regras do `table-row` atual).
- [ ] Casca: `RoundTab` na aba Rodada. O juiz (`me.judging`) entra na casca com `tabsFor('judge')`. `useActiveEvent(api, role === 'admin')` não consulta nada para o juiz, e o topo mostra o torneio do painel. Em `app.tsx`, o juiz escalado vai para a casca em `/painel` e `/conta`.
- [ ] `npm run check` passa. Conferir em 1280×720 com a API simulada (20 mesas, cores variadas): sem rolagem da página, clicar numa mesa troca o detalhe, juiz sem as ações de ADM.
- [ ] Commit `feat: aba Rodada no novo layout`, publicar o site, push e PR.
