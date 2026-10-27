# Nome e sobrenome no cadastro — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cadastro passa a ter Nome e Sobrenome separados (como o TOM pede); contas antigas têm o nome separado no primeiro espaço e conferem uma vez; a lista de inscritos mostra nome, sobrenome e ano com botão de copiar.

**Architecture:** `Profile.name` vira `firstName` + `lastName`; o nome completo passa a ser derivado (`fullName`). A conta ganha `nameReviewed` (gravado): contas antigas leem `false` e o celular mostra um cartão "Confira seu nome" até a pessoa salvar. A inscrição copia nome e sobrenome separados.

**Tech Stack:** TypeScript, Vitest, Preact + Tailwind, DynamoDB.

**Spec:** `docs/superpowers/specs/2026-10-26-ajustes-testes-design.md` (item 2).

## Global Constraints

- Nome e sobrenome: espaços aparados e repetidos colapsados; cada um de 1 a 50 caracteres. Mensagens: "Nome deve ter de 1 a 50 caracteres", "Sobrenome deve ter de 1 a 50 caracteres".
- Separação de nome antigo: primeiro espaço. "João da Silva" → "João" / "da Silva"; "Madonna" → "Madonna" / "" (sobrenome vazio só existe em dado antigo; a conferência exige preencher).
- `fullName` = `firstName` + " " + `lastName`, sem espaço sobrando quando o sobrenome está vazio.
- Conta nova (cadastro) nasce com `nameReviewed: true`; conta antiga lida sem o campo vem com `false`.
- A busca por nome e a ordem alfabética usam o nome completo (como hoje).
- `npm run check` passa ao fim de cada tarefa.

## Review Focus

- Conta antiga de uma palavra só ("Madonna"): o cartão de conferência aparece com o sobrenome vazio e não salva sem ele (teste na Tarefa 1).
- Conta antiga que faz login (a sessão regrava a conta) antes de conferir: continua `nameReviewed: false` (teste na Tarefa 1).
- Inscrição antiga só com `name` no DynamoDB: lê com nome e sobrenome separados (teste na Tarefa 1).
- Busca do ADM por sobrenome ("Silva") acha a conta (teste na Tarefa 1).
- Jogador conferindo o nome com evento ativo e já inscrito: a inscrição guarda o nome do momento da inscrição (comportamento atual, sem teste novo).

---

### Task 1: Núcleo e adaptadores

**Files:**
- Modify: `packages/core/src/identity/account.ts` (`Profile`, `Account.nameReviewed`, `validProfile`, novos `fullName`, `splitName`, `validName`, evento `name_confirmed`)
- Modify: `packages/core/src/identity/account-service.ts` (`register`, `byName`, `search`, novo `confirmName`)
- Modify: `packages/core/src/tournament/registration.ts`, `packages/core/src/tournament/registration-service.ts` (`name` → `firstName` + `lastName`)
- Modify: `packages/aws-adapters/src/dynamo-account-repository.ts` (`fromStored`), `packages/aws-adapters/src/dynamo-registration-repository.ts` (`registrationFromStored`)
- Test: `packages/core/test/identity/*` (onde hoje se testa `validProfile` e o cadastro), `packages/core/test/tournament/registration-service.test.ts`, `packages/core/test/tournament/registration-repository-contract.ts`, `packages/aws-adapters/test/dynamo-account-repository.test.ts`, `packages/aws-adapters/test/dynamo-registration-repository.test.ts`

**Interfaces:**
- Produces:
  - `interface Profile { firstName: string; lastName: string; birthYear: number; phone: string | null; guardianConsent: boolean }`
  - `Account.nameReviewed: boolean`
  - `fullName(p: { firstName: string; lastName: string }): string`
  - `splitName(full: string): { firstName: string; lastName: string }`
  - `validName(input: { firstName: string; lastName: string }): { firstName: string; lastName: string }` (lança `InvalidProfileError`)
  - `IdentityEventData` ganha `{ type: 'name_confirmed' }`
  - `AccountService.confirmName(identity: Identity, input: { firstName: string; lastName: string }): Promise<Account>`
  - `Registration` troca `name` por `firstName: string; lastName: string`

- [ ] **Step 1: Testes que falham**

```ts
it('nome e sobrenome são aparados e validados separadamente', () => {
  expect(validProfile({ ...base, firstName: '  João ', lastName: ' da   Silva ' }, now)).toMatchObject({ firstName: 'João', lastName: 'da Silva' });
  expect(() => validProfile({ ...base, firstName: '', lastName: 'Silva' }, now)).toThrow('Nome deve ter de 1 a 50 caracteres');
  expect(() => validProfile({ ...base, firstName: 'João', lastName: ' ' }, now)).toThrow('Sobrenome deve ter de 1 a 50 caracteres');
});

it('separa no primeiro espaço e junta sem espaço sobrando', () => {
  expect(splitName('João da Silva')).toEqual({ firstName: 'João', lastName: 'da Silva' });
  expect(splitName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
  expect(fullName({ firstName: 'Madonna', lastName: '' })).toBe('Madonna');
});

it('cadastro nasce conferido; confirmar o nome grava e marca conferido', async () => {
  // register(...) → nameReviewed true
  // conta gravada com nameReviewed:false → confirmName(identity, { firstName: 'Ana', lastName: 'Souza' })
  //   → profile { firstName: 'Ana', lastName: 'Souza' }, nameReviewed true; sem sobrenome → CommandRejected 'invalid_input'
});

it('ativar a sessão não marca o nome como conferido', async () => {
  // conta com nameReviewed:false → activateSession → nameReviewed continua false
});

it('a busca do ADM acha pelo sobrenome', async () => {
  // conta 'João' / 'da Silva' → search(admin, 'silva') contém a conta
});
```

`registration-service.test.ts`: a inscrição copia `firstName`/`lastName` da conta. No contrato do repositório, troque `name: 'Ana Souza'` por `firstName: 'Ana', lastName: 'Souza'`.

Adaptadores (leitura de dado antigo):

```ts
expect(fromStored({ ...stored, profile: { name: 'João da Silva', birthYear: 1990, phone: null, guardianConsent: false } } as never))
  .toMatchObject({ profile: { firstName: 'João', lastName: 'da Silva' }, nameReviewed: false });
expect(registrationFromStored({ ...storedRegistration, name: 'Madonna' } as never)).toMatchObject({ firstName: 'Madonna', lastName: '' });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/core packages/aws-adapters/test`
Expected: FAIL (`firstName`, `splitName`, `confirmName` não existem)

- [ ] **Step 3: Implementar**

`validProfile` usa `validName` para os dois campos. `byName` e o filtro de `search` usam `fullName(a.profile)`. `confirmName` segue `claimPlayerId` (via `execute`, ator `self(identity)`, evento `name_confirmed`). Nos adaptadores, `fromStored` da conta: se `profile.firstName` faltar, `splitName(profile.name)`, e `nameReviewed ?? false`; inscrição: se `firstName` faltar, `splitName(name)`. Os dois descartam o `name` antigo (listar os campos, como em `registrationFromStored`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/core packages/aws-adapters/test`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(core): nome e sobrenome separados; conta antiga confere o nome uma vez`

### Task 2: API e contratos

**Files:**
- Modify: `packages/contracts/src/index.ts` (`ProfileDto`, `MeResponse.nameReviewed`, `RegistrationDto`, `parseRegisterRequest`, novo `NameRequest` + `parseNameRequest`)
- Modify: `apps/api/src/api.ts` (`toAccount` com campos explícitos, `toMe`, `toRegistration`, rota `POST /me/name`)
- Test: `apps/api/test/api.test.ts` (ou onde hoje se testa `POST /me`), `apps/api/test/event.test.ts`, `apps/api/test/support.ts` (`register` manda `firstName`/`lastName`)

**Interfaces:**
- Consumes: Tarefa 1 (`confirmName`, `Profile`, `Registration`)
- Produces:
  - `ProfileDto { firstName; lastName; birthYear; phone; guardianConsent }`
  - `MeResponse.nameReviewed: boolean`
  - `RegistrationDto` troca `name` por `firstName`, `lastName`
  - `POST /me/name` com `{ firstName, lastName }` → `MeResponse`

- [ ] **Step 1: Testes que falham**

```ts
it('cadastro com nome e sobrenome; /me devolve conferido', async () => {
  // POST /me com profile { firstName: 'Ana', lastName: 'Souza', ... } → 201, body.profile { firstName: 'Ana', lastName: 'Souza' }, nameReviewed true
});

it('POST /me/name grava o nome conferido; sem sobrenome dá 400', async () => {
  expect(await call('POST', '/me/name', token, { firstName: 'Ana', lastName: 'Lima' })).toMatchObject({ status: 200, body: { profile: { lastName: 'Lima' }, nameReviewed: true } });
  expect((await call('POST', '/me/name', token, { firstName: 'Ana', lastName: '' })).status).toBe(400);
  expect((await call('POST', '/me/name', null, { firstName: 'Ana', lastName: 'Lima' })).status).toBe(401);
});
```

Em `event.test.ts`, a lista de inscritos traz `firstName: 'Ana', lastName: 'Souza', birthYear: 1990` (troca o `name: 'Ana Souza'`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run apps/api` → FAIL
- [ ] **Step 3: Implementar.** `toAccount` lista os campos do perfil (não espalha o objeto) para nada interno vazar.
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run apps/api` → PASS
- [ ] **Step 5: Commit** — `feat(api): nome e sobrenome nos contratos; POST /me/name`

### Task 3: Site e documentação

**Files:**
- Modify: `apps/web/src/flow.ts` (`RegisterForm` com `firstName`, `lastName`), `apps/web/src/screens/register.tsx`
- Create: `apps/web/src/screens/name-review.tsx` (cartão "Confira seu nome", no padrão de `player-id.tsx`)
- Modify: `apps/web/src/screens/home.tsx` (mostra o cartão quando `!me.nameReviewed`), `apps/web/src/api.ts` (`confirmName`)
- Modify: `apps/web/src/screens/registrations.tsx` (colunas Nome, Sobrenome, Ano, cada uma com copiar)
- Modify: onde o site mostra `profile.name` (`admin-shell.tsx`, `home.tsx`, `event-panel.tsx`, `registrations.tsx`, `team.tsx`, `unlink.tsx`): usar `profile.firstName` para saudação e `fullName` para o resto
- Modify: `packages/contracts/src/index.ts` (exporta `displayName(p: { firstName: string; lastName: string }): string`, o mesmo cálculo de `fullName`, para o site)
- Modify: `README.md` (campos do cadastro)
- Test: `apps/web/test/flow.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
it('cadastro manda nome e sobrenome aparados', () => {
  expect(toRegisterRequest({ firstName: ' Ana ', lastName: ' Souza ', birthYear: '1990', phone: '', playerId: '', guardianConsent: false }).profile)
    .toMatchObject({ firstName: 'Ana', lastName: 'Souza' });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run apps/web` → FAIL
- [ ] **Step 3: Implementar.** Textos fixos: rótulos "Nome" e "Sobrenome" (autocomplete `given-name` e `family-name`). Cartão: título "Confira seu nome", texto "Separamos seu nome em nome e sobrenome, como o TOM pede. Confira e salve.", botão "Salvar". Na tabela de inscritos: cabeçalhos "Nome", "Sobrenome", "Ano"; botões com `title` "Copiar nome", "Copiar sobrenome", "Copiar ano".
- [ ] **Step 4: Rodar tudo** — `npm run check` → PASS
- [ ] **Step 5: Ver no navegador** — build + `vite preview`; conferir a tela de cadastro (rótulos) e que não há erro no console. Telas logadas ficam para o teste no ambiente de teste.
- [ ] **Step 6: Commit** — `feat(web): cadastro com nome e sobrenome; conferência única do nome; inscritos com copiar por campo`

### Task 4: Teste na AWS e PR

- [ ] **Step 1:** Atualizar `apps/api/test/api.aws.test.ts` para cadastrar com `firstName`/`lastName`.
- [ ] **Step 2:** Publicar o branch no `TomApiTest` (`npx cdk deploy TomApiTest --exclusively --profile tom` em `infra`) e rodar `npm run test:aws` → todos passando.
- [ ] **Step 3:** Commit, push, PR com base `main`.
