# Pasta do TOM conectada pelo navegador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o ADM escolhe a pasta do TOM uma vez, no painel do evento, e o próprio site envia os relatórios novos com o login do ADM. Sem token na tela e sem comando.

**Architecture:**
- O núcleo do enviador (`Uploader`) fica independente do Node: hash e registro do que já foi enviado passam a ser injetados e assíncronos. Ele roda igual no notebook (CLI, plano B) e no navegador.
- No site, uma pasta sobre a File System Access API, um registro de envios no IndexedDB e um destino que chama a rota nova `POST /events/active/uploads`.
- A rota exige o login do ADM, manda para o evento ativo e reaproveita a ingestão atual.

**Tech Stack:** TypeScript, Preact, Vitest, File System Access API (Chrome e Edge), IndexedDB, Web Crypto.

**Spec:** `docs/superpowers/specs/2026-10-24-pasta-tom-navegador-design.md`. Base: plano 4 (`docs/superpowers/plans/2026-10-24-4-evento-qr.md`), evento ativo.

## Global Constraints

- Nenhum recurso AWS novo e nenhuma mudança de IAM. A rota nova usa as mesmas tabelas e o mesmo bucket.
- O site só **lê** a pasta, e só os `.html` da pasta escolhida.
- Envia só para o **evento ativo**. Sem evento ativo, não envia, e o cartão mostra `Crie o evento para começar a enviar`.
- O token do enviador **não aparece** na tela. O CLI continua existindo como plano B, documentado no README.
- Mensagens exatas:
  - `Use o Chrome ou o Edge neste notebook para conectar a pasta do TOM.`
  - `Pasta não conectada`
  - `Sem permissão: clique em Permitir`
  - `Conectado à pasta {nome} · último envio às {hh:mm} ({relatório})`
  - `Conectado à pasta {nome} · nada enviado ainda`
  - `A pasta está com o torneio {B}, mas este evento é do torneio {A}. Abra o torneio {A} no TOM.`
  - `Crie o evento para começar a enviar`
- Rótulos dos relatórios no cartão:
  - `pairings` → pareamento
  - `match_slips` → guias
  - `standings` → classificação
  - qualquer outro → o nome do tipo
- Intervalo de verificação: **3 s**.
- Autoria dos envios pelo navegador: ator `{ role: 'system', source: 'navegador:<accountId do ADM>' }`.
- Textos em pt-BR, `styles.css` atual. `npm run check` verde ao fim de cada tarefa.

## Review Focus

1. Perda da permissão da pasta no meio do evento (o navegador revoga): o cartão sai de "Conectado" e pede "Permitir"; nunca mostra conectado sem poder ler. → teste na Tarefa 3.
2. Recarregar a página não reenvia o que já foi enviado neste evento; um evento novo envia de novo. → teste na Tarefa 3.
3. Arquivo do TOM ainda sendo gravado (HTML sem `</html>`) não é enviado até ficar completo. Comportamento do núcleo atual, preservado. → o teste do `uploader` continua.
4. Sem evento ativo, ou com o evento encerrado ou cancelado: a rota recusa e nada é guardado. → teste na Tarefa 2.
5. Jogador ou juiz chamando a rota do ADM: 403. → teste na Tarefa 2.

---

### Task 1: Núcleo do enviador sem Node

**Files:**
- Create: `apps/uploader/src/core.ts`
- Modify: `apps/uploader/src/uploader.ts`, `sent-log.ts`, `main.ts`, `index.ts`, `apps/uploader/package.json`, `packages/tom-reports/package.json`
- Create: `packages/tom-reports/src/files.ts`
- Test: `apps/uploader/test/uploader.test.ts`, `apps/uploader/test/local-io.test.ts`

**Interfaces:**
- Produces:
  - `UploaderDeps` ganha `hash: (content: string) => Promise<string>`. O CLI passa o SHA-256 do `node:crypto`; o site passa o do Web Crypto. Sai o `import 'node:crypto'` de `uploader.ts`.
  - `SentLog.get(fileName)` passa a devolver `Promise<string | undefined>`. `MemorySentLog` e o log em arquivo seguem a porta nova.
  - `apps/uploader/src/core.ts` exporta, sem nada de Node: `Uploader`, `looksComplete`, `DEFAULT_QUIET_MS` e os tipos `Folder`, `FileStat`, `Sink`, `Snapshot`, `SentLog` e `FatalSinkError`. Se `FatalSinkError` estiver em `http-sink.ts` junto com código de Node, ele vai para um arquivo próprio.
  - `package.json` do uploader: `exports["./core"]` → `{ "source": "./src/core.ts", "types": "./dist/core.d.ts", "default": "./dist/core.js" }`.
  - `packages/tom-reports/src/files.ts` reexporta só `report-file.ts` e `latest-tournament.ts`, e o `package.json` ganha `exports["./files"]` no mesmo formato. O `uploader.ts` importa de `@tom/tom-reports/files`, para o site não levar os parsers de HTML.
  - `apps/web/package.json` passa a depender de `@tom/uploader` (workspace).

- [ ] **Step 1: Write the failing test**: em `uploader.test.ts`, o teste existente de "não reenvia o mesmo conteúdo" passa a usar um `hash` injetado. Novo teste: `usa o hash injetado e o registro assíncrono`. Um `hash` falso que devolve `h:<tamanho>` aparece no `sha256` do envio, e um `SentLog` cujo `get` resolve o mesmo hash impede o reenvio.
- [ ] **Step 2: Run** `npx vitest run apps/uploader` — Expected: FAIL.
- [ ] **Step 3: Implement**: confira com `grep -n "node:" apps/uploader/src/core.ts apps/uploader/src/uploader.ts` que não sobrou nada.
- [ ] **Step 4: Run** `npm run check` — Expected: PASS.
- [ ] **Step 5: Commit** — `refactor: núcleo do enviador sem Node (hash e registro injetados)`

### Task 2: Envio do ADM para o evento ativo

**Files:**
- Modify: `packages/core/src/tournament/event-service.ts`, `apps/api/src/ingest.ts`, `apps/api/src/api.ts`
- Test: `packages/core/test/tournament/event-service.test.ts`, `apps/api/test/ingest.test.ts`

**Interfaces:**
- Produces:
  - `EventService.authorizeAdminUpload(actor: Actor | null, tournament: string): Promise<TournamentEvent>`:
    - só ADM;
    - sem evento ativo → `event_state` com `Crie o evento para começar a enviar`;
    - evento ativo já amarrado a outro torneio → `tournament_mismatch` com `A pasta está com o torneio {tournament}, mas este evento é do torneio {event.tournament}. Abra o torneio {event.tournament} no TOM.`;
    - sem torneio amarrado, amarra, com a mesma lógica e a mesma repetição de `authorizeUpload`. Extraia um `bind(record, tournament)` privado para as duas.
  - `createIngest(...)` passa a devolver `{ withToken(token, upload), forEvent(event: TournamentEvent, upload, author: Actor) }`. As duas validam o arquivo e guardam a fotografia, e `forEvent` usa o `author` em `publishPairing`; o resto é o corpo atual depois da autorização. O `type Ingest` acompanha.
  - Rota `POST /events/active/uploads` (ADM):
    - corpo `UploadRequest`, com o mesmo `parseUploadRequest` e o mesmo limite;
    - `events.authorizeAdminUpload(actor, upload.tournament)` → `ingest.forEvent(event, upload, { role: 'system', source: \`navegador:${actor.accountId}\` })`;
    - devolve `UploadResponse`.
  - `POST /uploads` segue igual, chamando `ingest.withToken`.

- [ ] **Step 1: Write the failing tests**:
  - Serviço:
    - `ADM envia para o evento ativo e amarra o torneio`;
    - `sem evento ativo: recusa com a mensagem`;
    - `torneio diferente do amarrado: mensagem com os dois nomes`;
    - `jogador e juiz não enviam`.
  - API (`ingest.test.ts`):
    - `ADM envia pelo navegador: pareamento + guias publicam a rodada do evento ativo`;
    - `jogador recebe 403`;
    - `evento cancelado: recusa e nada é guardado` (um segundo envio com outro evento ativo responde `stored: true`);
    - `token antigo continua funcionando`.
- [ ] **Step 2: Run** `npx vitest run packages/core/test/tournament apps/api` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: ADM envia os relatórios do TOM para o evento ativo`

### Task 3: Pasta do TOM no painel do evento

**Files:**
- Create:
  - `apps/web/src/tom-folder/browser-folder.ts`
  - `apps/web/src/tom-folder/stores.ts`
  - `apps/web/src/tom-folder/status.ts`
  - `apps/web/src/tom-folder/folder-card.tsx`
- Modify: `apps/web/src/screens/event-panel.tsx`, `apps/web/src/api.ts`, `apps/web/package.json`
- Test: `apps/web/test/tom-folder.test.ts`

**Interfaces:**
- Consumes: `Uploader` e os tipos de `@tom/uploader/core` (Tarefa 1) e a rota da Tarefa 2.
- Produces:
  - `browserFolder(handle: FileSystemDirectoryHandle): Folder`:
    - `list` percorre `handle.values()`, só arquivos `.html`, com `size` e `lastModified` de `getFile()`;
    - `read(name)` recusa nome com `/` ou `\`, e lê com `getFileHandle(name)` → `getFile()` → `text()`.
  - `stores.ts`:
    - `saveHandle`/`loadHandle` no IndexedDB (banco `tom-folder`, store `handles`, chave `tom`);
    - `idbSentLog(eventId: string): SentLog`, com a chave `<eventId>|<fileName>`;
    - qualquer falha do IndexedDB cai para memória sem lançar erro.
  - `status.ts`, puro e testado: `folderStatus(state: FolderState): { text: string; tone: 'ok' | 'warn' | 'error' }` com os textos exatos das Global Constraints. O estado é um destes:
    - `unsupported`
    - `no-event`
    - `disconnected`
    - `needs-permission { name }`
    - `connected { name; last: { at: Date; type: string } | null }`
    - `error { message }`
  - `api.ts`: `uploadAsAdmin(request: UploadRequest): Promise<ApiResult<UploadResponse>>` → `POST /events/active/uploads`.
  - `folder-card.tsx`: o bloco "Pasta do TOM" no painel do evento.
    - Botões: "Conectar pasta do TOM" (`showDirectoryPicker({ mode: 'read' })`, gesto do usuário), "Permitir acesso à pasta {nome}" (`requestPermission({ mode: 'read' })`) e "Trocar pasta".
    - Com o evento ativo e permissão `granted`, um `Uploader` roda a cada **3 s**:
      - `hash` = SHA-256 do Web Crypto em hexadecimal;
      - o `Sink` chama `uploadAsAdmin` e transforma erro da API em `FatalSinkError` com a mensagem dela.
    - Antes de cada volta, confere `queryPermission`. Se deixar de ser `granted`, o estado vai para `needs-permission` (Review Focus 1).
    - Para de olhar ao desmontar ou quando o evento deixa de estar ativo.
  - `event-panel.tsx`: sai o bloco do comando com o token (texto, `<p class="code">` e "Copiar comando"), e entra o `FolderCard` com o evento ativo.

- [ ] **Step 1: Write the failing tests** (`tom-folder.test.ts`, com um `FileSystemDirectoryHandle` falso feito de objetos simples):
  - `lista só os .html, com tamanho e data`;
  - `não lê fora da pasta`;
  - `registro em memória quando o IndexedDB falha: o que foi enviado não volta; outro evento envia de novo` (Review Focus 2);
  - `textos do estado` (um por estado, com os textos exatos);
  - `perdeu a permissão: sai de conectado` (a função que decide o próximo estado a partir do resultado de `queryPermission`).
- [ ] **Step 2: Run** `npx vitest run apps/web` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check` — Expected: PASS.
- [ ] **Step 5: Verify** com `vite preview` e `browser-automation`:
  - A API é simulada por `page.route`.
  - `page.addInitScript` troca `window.showDirectoryPicker` por um handle falso: pasta `TOM_DATA` com `FODASEpairings.html` e `FODASEmatch_slips.html` completos, e `queryPermission` → `granted`.
  - "Conectar pasta do TOM" → "Conectado à pasta TOM_DATA" → os dois `POST /api/events/active/uploads` saem, e o cartão mostra o último envio.
  - Sem `showDirectoryPicker`: a mensagem de navegador não suportado.
  - Nenhum `TOM_UPLOAD_TOKEN` na página.
  - Leia um screenshot. Pare o preview e confira a porta.
- [ ] **Step 6: Commit** — `feat: pasta do TOM conectada pelo navegador no painel do evento`

### Task 4: Teste real, documentação e deploy

**Files:**
- Modify: `apps/api/test/api.aws.test.ts`, `README.md`, `docs/spec-tom.md`

- [ ] **Step 1: AWS test** `ADM envia pelo navegador para o evento ativo`:
  - cancela o ativo que sobrou e cria o evento;
  - `POST /events/active/uploads` com os HTMLs reais (pareamento e guias) → 200 e `published`;
  - um jogador → 403;
  - cancela no fim.
- [ ] **Step 2: Docs**:
  - README:
    - "Conectar a pasta do TOM" como caminho principal (Chrome ou Edge no notebook do TOM, painel do evento, botão);
    - o comando do enviador como plano B;
    - a rota nova na tabela.
  - `docs/spec-tom.md`: Revisão 8 (envio pelo navegador do ADM; executável como evolução).
- [ ] **Step 3: Deploy de teste**: o usuário roda `npx cdk deploy TomApiTest --profile tom`. Não há mudança de IAM. Depois, `npm run test:aws` — Expected: PASS.
- [ ] **Step 4: Commit** — `docs: pasta do TOM pelo navegador`
- [ ] **Step 5: Deploy de produção** (entre eventos): o usuário roda `npx cdk deploy TomApi --profile tom` e depois, na raiz, `npm run web:deploy`.
