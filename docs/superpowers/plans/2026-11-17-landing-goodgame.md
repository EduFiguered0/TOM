# Landing GoodGame (fase 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** colocar no ar hoje a landing de ingressos Yu-Gi-Oh! da GoodGame. Ela pede login Google e cadastro, registra a intenção de compra com a origem (UTM) e redireciona para a LigaMagic.

**Architecture:** módulo isolado do TOM no mesmo monorepo:

- `packages/landing-core`: domínio puro, usado pelo front e pela API.
- `apps/landing-api`: Lambda com Function URL e DynamoDB.
- `apps/landing`: Preact + Vite + Tailwind.
- `infra/src/landing-stack.ts`: tabela, Lambda, cliente de app no pool `ggtcg-login`, S3 e CloudFront com `/api/*`.

O login Google (PKCE) sai de `apps/web` para `packages/web-auth`, para os dois sites usarem o mesmo código.

**Tech Stack:** TypeScript (ESM, `exactOptionalPropertyTypes`), Preact 10, Vite 6, Tailwind 4, Vitest 4, AWS CDK 2 + cdk-nag, `@aws-sdk/lib-dynamodb`, `aws-jwt-verify`.

**Spec:** `docs/superpowers/specs/2026-11-17-landingpage-design.md` (design aprovado) e `docs/superpowers/specs/2026-11-17-landingpage.md` (requisitos).

## Global Constraints

- Região `us-east-2`, perfil `tom`. Sem Lambda@Edge. Nomes `tom-prod-gg-*` via `nameOf(stage, 'gg-…')`.
- `storeId = 'goodgame'` em toda chave do DynamoDB (`store#goodgame#…`).
- TTL `expiresAt` = agora + **180 dias**, renovado a cada gravação do lead.
- Eventos:
  - `ots-genesys-2026-11-21`: "OTS Championship Genesys", 2026-11-21 11:00, venda fecha em `2026-11-21T11:00:00-03:00`.
  - `ots-avancado-2026-11-22`: "OTS Championship Avançado", 2026-11-22 11:00, venda fecha em `2026-11-22T11:00:00-03:00`.
  - Os dois: R$ 75,00, "Estr. do Mendanha, 646 – loja B, Campo Grande, Rio de Janeiro".
- Link de compra (só no servidor): `https://www.ggtcg.com.br/?view=ecom/itens&cat=214899&ing=1`.
- Controlador dos dados: GOOD GAME TCG LTDA, CNPJ 54.733.547/0001-25, Estrada do Mendanha, 646, Loja B, Campo Grande, Rio de Janeiro/RJ, CEP 23087-285, contato `gg.goodgame.tcg@gmail.com`.
- Termos e Política **v1.0**: arquivos imutáveis. Mudar o texto = nova versão.
- Proibido: CPF, intenção virar `Purchase`, URL de compra vinda do cliente, liberar o link só no front.
- Nada de import de `@tom/core`, `@tom/aws-adapters` ou `@tom/contracts` no módulo landing.
- Branch `feat/landing-goodgame` a partir de `main`. Um commit por task. `npm run check` verde antes de cada commit. Deploy em produção só com autorização explícita do usuário (Task 8).
- Toda mudança passa pelo checklist da skill `security-auditor`.

## Review Focus

1. **Volta do Google sem UTM:** a UTM capturada antes do login precisa sobreviver ao redirecionamento. Teste em `utm.test.ts` (Task 6).
2. **Dois cliques simultâneos no primeiro login:** não pode surgir lead duplicado. A transação condicional na trava resolve, e a segunda chamada relê o lead existente. Teste em `lead-service.test.ts` (Task 4).
3. **Checkout após o horário de fechamento ou `eventId` desconhecido/forjado:** a API responde 409 `EVENT_CLOSED` ou 404 `EVENT_NOT_FOUND`, sem gravar intenção. Teste em `eligibility.test.ts` (Task 2) e `api.test.ts` (Task 4).
4. **UTM com lixo** (HTML, 5 KB, emoji): é limpa e truncada, nunca recusa o checkout. Teste em `utm.test.ts` (Task 2).
5. **Menor de 12 anos:** a LGPD (art. 14) exige consentimento específico do responsável, que não coletamos. O cadastro recusa com "Menores de 12 anos: o cadastro deve ser feito pelo responsável, em nome dele." Teste em `lead.test.ts` (Task 2). *Decisão do construtor, avisada ao usuário.*

---

### Task 1: Extrair o login do site para `packages/web-auth`

**Files:**
- Create: `packages/web-auth/package.json` (`@tom/web-auth`, `exports['.'].source = ./src/index.ts`, sem dependências), `packages/web-auth/tsconfig.json` (copiar o de `packages/contracts`, com `lib` + `DOM`), `packages/web-auth/src/index.ts`.
- Move (`git mv`): `apps/web/src/auth/{cognito,google,session}.ts` → `packages/web-auth/src/`, e `apps/web/test/{auth,google}.test.ts` → `packages/web-auth/test/`.
- Modify: imports em `apps/web/src/**` (de `./auth/...` para `@tom/web-auth`), `apps/web/package.json` (dependência `@tom/web-auth: 0.0.0`), `tsconfig.json` raiz (reference).

**Interfaces:**
- Produces: `@tom/web-auth` exporta `createGoogle`, `Google`, `GoogleConfig`, `GoogleStore`, `createSession`, `browserStorage`, `Storage`, `Tokens`, `AuthError`, `Cognito` e o que mais `apps/web` já importava desses 3 arquivos. Assinaturas inalteradas.
- `createGoogle` ganha `scope?: string` em `GoogleConfig`. O padrão continua `'openid email aws.cognito.signin.user.admin'`, e a landing passa `'openid email profile aws.cognito.signin.user.admin'`.

- [ ] **Step 1:** `git switch main && git pull && git switch -c feat/landing-goodgame`.
- [ ] **Step 2:** mover os arquivos, criar o pacote e trocar os imports. Rodar `npm install` para ligar o workspace.
- [ ] **Step 3:** adicionar em `packages/web-auth/test/google.test.ts` o teste `it('usa o escopo informado')`: `authorizeUrl()` com `scope: 'openid email profile aws.cognito.signin.user.admin'` contém `scope=openid+email+profile+aws.cognito.signin.user.admin`.
- [ ] **Step 4:** rodar `npx vitest run packages/web-auth`. Esperado: FAIL só no teste novo.
- [ ] **Step 5:** implementar `scope` em `GoogleConfig`.
- [ ] **Step 6:** rodar `npm run check && npm run build -w @tom/web`. Esperado: tudo verde, e o build do site igual (sem mudança de comportamento).
- [ ] **Step 7:** commit `refactor: login do site em pacote próprio (@tom/web-auth)`.

### Task 2: Domínio da landing (`packages/landing-core`)

**Files:**
- Create: `packages/landing-core/{package.json,tsconfig.json}` (`@tom/landing-core`, sem dependências), `src/index.ts`, `src/lead.ts`, `src/utm.ts`, `src/events.ts`, `src/eligibility.ts`, `src/legal.ts`, `src/stores/goodgame.ts`.
- Create: `apps/landing/public/legal/termos-v1.0.md` e `apps/landing/public/legal/privacidade-v1.0.md` (rascunho para revisão do usuário).
- Test: `packages/landing-core/test/{lead,utm,eligibility,legal}.test.ts`.
- Modify: `tsconfig.json` raiz (reference).

**Interfaces (Produces):**

```ts
// lead.ts
export type LeadStatus = 'INCOMPLETE' | 'COMPLETE';
export interface Utm { source: string; medium: string | null; campaign: string | null; content: string | null }
export interface Lead {
  leadId: string; storeId: string; googleSub: string; cognitoSub: string;
  fullName: string; email: string; phone: string | null; birthDate: string | null; // AAAA-MM-DD
  status: LeadStatus; marketingOptIn: boolean; firstTouch: Utm & { at: string };
  createdAt: string; updatedAt: string; version: number;
}
export interface ProfileInput { fullName: string; phone: string; birthDate: string; acceptTerms: boolean; marketingOptIn: boolean }
export class InvalidLeadError extends Error { constructor(readonly field: keyof ProfileInput, message: string) }
export const validProfile: (input: ProfileInput, now: Date) => Omit<ProfileInput, 'acceptTerms'>; // normalizado
export const statusOf: (lead: Pick<Lead, 'fullName' | 'phone' | 'birthDate'>) => LeadStatus;
// utm.ts
export const cleanUtm: (raw: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content', unknown>>) => Utm;
// events.ts
export interface StoreEvent { id: string; name: string; date: string; time: string; priceCents: number; location: string; image: string; salesCloseAt: string }
export interface StoreConfig { storeId: string; storeName: string; checkoutUrl: string; events: StoreEvent[] }
// stores/goodgame.ts
export const goodgame: StoreConfig; // valores da seção Global Constraints; image '/events/<id>.jpeg'
// eligibility.ts
export type CheckoutRefusal = 'PROFILE_INCOMPLETE' | 'TERMS_OUTDATED' | 'EVENT_NOT_FOUND' | 'EVENT_CLOSED';
export const checkoutDecision: (a: { lead: Lead | null; acceptedTermsVersion: string | null; eventId: string; config: StoreConfig; now: Date }) =>
  { ok: true; event: StoreEvent } | { ok: false; reason: CheckoutRefusal };
// legal.ts
export interface LegalDoc { kind: 'terms' | 'privacy'; version: string; path: string; sha256: string }
export const LEGAL: { terms: LegalDoc; privacy: LegalDoc }; // version '1.0', path '/legal/termos-v1.0.md' | '/legal/privacidade-v1.0.md'
```

Regras que o código precisa seguir:

- **`fullName`:** espaços colapsados, de 3 a 100 caracteres, com pelo menos 2 palavras.
- **`phone`:** só dígitos. São 10 ou 11, com DDD de 11 a 99. Se tiver 11 dígitos, o 3º é `9`.
- **`birthDate`:** data ISO real, nunca futura, de 1900 em diante. Idade de 12 anos ou mais.
- **`acceptTerms`:** precisa ser `true`.
- **Mensagens de erro em pt-BR, por campo.**
- **`cleanUtm`:** cada valor é convertido para string, minúsculas e trim. Tudo que não for `[a-z0-9._-]` é removido, e o resultado fica com no máximo 64 caracteres. Fonte vazia vira `'direct'`; os outros campos vazios viram `null`.

- [ ] **Step 1: testes que falham**
  - `lead.test.ts`:
    - aceita `{ fullName: '  Ana  Souza ', phone: '(21) 99876-5432', birthDate: '2000-05-10', acceptTerms: true, marketingOptIn: false }`, normalizado para `fullName 'Ana Souza'` e `phone '21998765432'`;
    - aceita o fixo `'2132345678'` (10 dígitos);
    - recusa, cada um com o seu `field`: telefone vazio, `'21898765432'` (11 dígitos sem o 9), `'0198765432'` (DDD inválido), data vazia, `'2030-01-01'`, `'2000-02-30'`, idade de 11 anos em `now = 2026-11-17`, e `acceptTerms: false`;
    - `ProfileInput` não tem nenhuma chave `cpf`: `expectTypeOf<ProfileInput>().not.toHaveProperty('cpf')`;
    - `statusOf` devolve `INCOMPLETE` sem telefone ou sem data, e `COMPLETE` com os dois.
  - `utm.test.ts`:
    - `cleanUtm({})` dá `{ source: 'direct', medium: null, campaign: null, content: null }`;
    - `cleanUtm({ utm_source: 'Instagram', utm_campaign: 'OTS<script>' })` dá `source 'instagram'` e `campaign 'otsscript'`;
    - um valor de 5000 caracteres fica com 64.
  - `eligibility.test.ts`, com `now = 2026-11-18T12:00Z`:
    - lead `COMPLETE`, termos `'1.0'` e `ots-genesys-2026-11-21` → ok;
    - lead null ou `INCOMPLETE` → `PROFILE_INCOMPLETE`;
    - termos `null` ou `'0.9'` → `TERMS_OUTDATED`;
    - `'evento-x'` → `EVENT_NOT_FOUND`;
    - com `now = 2026-11-21T14:00:00Z` (11:00 BRT) → `EVENT_CLOSED`.
  - `legal.test.ts`: para cada doc do `LEGAL`, o sha256 de `apps/landing/public/legal/<arquivo>` (lido com `readFileSync` relativo à raiz do repo) é igual a `LEGAL.<doc>.sha256`. Esse teste impede que alguém edite uma versão já publicada.
- [ ] **Step 2:** rodar `npx vitest run packages/landing-core`. Esperado: FAIL (módulos inexistentes).
- [ ] **Step 3:** escrever os dois textos legais em pt-BR, com linguagem simples e Markdown simples (só `#`, `##`, parágrafos e listas `-`).
  - **Termos:** objeto (landing de pré-cadastro e redirecionamento para a compra na LigaMagic), a venda é feita pela LigaMagic e não pela landing, regras de uso, versão e data de vigência 2026-11-17.
  - **Política:** controlador (dados acima); dados coletados (nome, e-mail, telefone, nascimento, identificador Google, origem do acesso); finalidades (identificar o comprador, medir canais de divulgação e, se houver opt-in, enviar novidades); bases legais (execução de procedimentos preliminares a contrato, legítimo interesse para medição e consentimento para marketing); sem venda nem compartilhamento além de AWS (hospedagem) e Google (login); retenção de 6 meses; direitos do titular (art. 18) e canal para exercê-los; menores de 12 anos não podem se cadastrar; versão e data.
  - Calcular os hashes com `node -e "…createHash('sha256')…"` e gravá-los em `LEGAL`.
- [ ] **Step 4:** implementar os módulos.
- [ ] **Step 5:** rodar `npx vitest run packages/landing-core && npm run typecheck`. Esperado: PASS.
- [ ] **Step 6:** commit `feat(landing): domínio de lead, origem, eventos e termos versionados`.

### Task 3: Repositório DynamoDB dos leads

**Files:**
- Create: `apps/landing-api/{package.json,tsconfig.json}` (`@tom/landing-api`). Dependências: `@tom/landing-core`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-cognito-identity-provider`, `aws-jwt-verify` (as mesmas versões de `apps/api`). Dev: `@types/aws-lambda`.
- Create: `apps/landing-api/src/lead-repository.ts`.
- Test: `apps/landing-api/test/lead-repository.test.ts`.

**Interfaces:**
- Consumes: `Lead`, `Utm` (Task 2).
- Produces:

```ts
export interface ConsentRecord { kind: 'terms' | 'privacy' | 'marketing'; version: string | null; sha256: string | null; value: boolean; at: string }
export interface IntentRecord { intentId: string; leadId: string; eventId: string; at: string; utm: Utm; status: 'REDIRECTED' }
export class LeadExistsError extends Error {}
export class LeadConflictError extends Error {}           // versão mudou
export interface LeadRepository {
  findByGoogleSub(storeId: string, googleSub: string): Promise<Lead | null>;
  create(lead: Lead): Promise<void>;                       // lança LeadExistsError se a trava existir
  update(lead: Lead, consents: ConsentRecord[]): Promise<void>; // condicional em version-1; lança LeadConflictError
  latestConsent(storeId: string, leadId: string, kind: ConsentRecord['kind']): Promise<ConsentRecord | null>;
  addIntent(storeId: string, intent: IntentRecord, lead: Lead): Promise<void>; // grava a intenção e renova o expiresAt do lead
}
export class DynamoLeadRepository implements LeadRepository { constructor(client: DynamoDBDocumentClient, opts: { tableName: string; retentionDays?: number /* 180 */ ; now?: () => Date }) }
```

As chaves seguem a tabela de dados do design:

- `create`: `TransactWrite` com Put condicional (`attribute_not_exists(pk)`) no item `lock` e no item `lead`. Um cancelamento por condição vira `LeadExistsError`.
- `update`: Put do lead com condição `version = :prev`, mais um Put por consentimento, tudo em uma `TransactWrite`.
- `latestConsent`: `Query` em `pk`, com `begins_with(sk, 'consent#')`, `ScanIndexForward: false`, filtrado por `kind`.
- Todo item recebe `expiresAt` em epoch segundos.

- [ ] **Step 1:** testes que falham, com um `send` falso que registra os comandos (padrão de `packages/aws-adapters/test`):
  - `create` envia 2 Puts com `ConditionExpression` e as chaves `store#goodgame#google#g-1` / `lock` e `store#goodgame#lead#<id>` / `lead`;
  - `TransactionCanceledException` com `ConditionalCheckFailed` vira `LeadExistsError`;
  - `update` de um lead `version 3` usa `:prev = 2` e grava os consentimentos com `sk` começando por `consent#`;
  - `addIntent` grava `sk` `intent#<iso>#<id>` com `status 'REDIRECTED'` e **nenhum** item com `sk` `purchase` (spec, item 14);
  - `expiresAt` = `now + 180*86400`.
- [ ] **Step 2:** rodar `npx vitest run apps/landing-api`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar o mesmo comando. Esperado: PASS. Depois, `npm run check`.
- [ ] **Step 5:** commit `feat(landing): repositório DynamoDB de leads, consentimentos e intenções`.

### Task 4: Serviço, API e handler da landing

**Files:**
- Create: `apps/landing-api/src/{identity.ts,lead-service.ts,api.ts,handler.ts,index.ts}`.
- Test: `apps/landing-api/test/{identity,lead-service,api}.test.ts`.
- Modify: `tsconfig.json` raiz (reference).

**Interfaces:**
- Consumes: Tasks 2 e 3.
- Produces:

```ts
// identity.ts
export interface GoogleIdentity { cognitoSub: string; googleSub: string }
export interface Verifier { verify(accessToken: string): Promise<GoogleIdentity> } // lança se não for google_<sub>
export class CognitoGoogleVerifier implements Verifier { constructor(userPoolId: string, clientId: string) } // aws-jwt-verify, tokenUse 'access'
export interface ProfileLookup { profile(accessToken: string): Promise<{ email: string; name: string | null }> } // GetUser; exige email_verified
// lead-service.ts
export interface MeView { lead: Lead; termsAccepted: boolean; missing: ('phone' | 'birthDate' | 'terms')[] }
export class LeadService {
  constructor(deps: { repo: LeadRepository; config: StoreConfig; clock: { now(): Date }; ids: { next(): string } })
  me(id: GoogleIdentity, google: { email: string; name: string | null }, utm: Utm): Promise<MeView>; // cria INCOMPLETE se não existir; corrida → relê
  update(id: GoogleIdentity, input: ProfileInput): Promise<MeView>; // valida; grava consentimentos terms+privacy (LEGAL) se ainda não aceitos nesta versão; marketing se mudou
  checkout(id: GoogleIdentity, eventId: string, utm: Utm): Promise<{ ok: true; url: string } | { ok: false; reason: CheckoutRefusal }>;
}
// api.ts — mesmo formato de apps/api: (req: { method; path; headers; body }) => Promise<{ status; body; cacheControl? }>
export const createLandingApi: (deps: { verifier: Verifier; profiles: ProfileLookup; service: LeadService; config: StoreConfig; now: () => Date; logError(e: unknown): void }) => …
```

Rotas e respostas:

| Rota | Login | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /events` | não | — | 200 `{ events: (StoreEvent sem nada de checkout + closed: boolean)[] }`, `cache-control: public, max-age=60` |
| `GET /me` | sim | — (UTM em `?utm_*`) | 200 `MeView` (sem `googleSub`/`cognitoSub`) |
| `PUT /me` | sim | `ProfileInput` | 200 `MeView` · 400 `{ error: 'INVALID', field, message }` |
| `POST /checkout` | sim | `{ eventId, utm }` | 200 `{ url }` · 409 `{ error: reason }` (404 para `EVENT_NOT_FOUND`) |

- Sem token ou com token inválido: 401 `{ error: 'UNAUTHORIZED' }`.
- Login com senha (username sem `google_`): 403 `{ error: 'GOOGLE_ONLY' }`.
- Corpo acima de 4 KB ou JSON inválido: 400.
- Erro inesperado: chama `logError` e responde 500 `{ error: 'INTERNAL' }`, sem detalhes.
- `checkout` com sucesso grava `IntentRecord` (`status 'REDIRECTED'`) **antes** de devolver `config.checkoutUrl`.
- O handler segue o formato de `apps/api/src/handler.ts`, com o prefixo `/api` removido e as variáveis `LEADS_TABLE`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`.

- [ ] **Step 1:** testes que falham, com repositório em memória e verificador falso:
  - **`identity.test.ts`:**
    - payload com `username 'google_123'` → `googleSub '123'`;
    - `username` UUID (senha) → erro.
  - **`lead-service.test.ts`:**
    - primeiro `me` cria `INCOMPLETE`, com nome e e-mail do Google e `firstTouch.source 'instagram'` (spec, item 4);
    - segundo `me` com o mesmo `googleSub` devolve o mesmo `leadId` e mantém o `firstTouch` (item 3);
    - `create` lançando `LeadExistsError` faz a segunda chamada reler e devolver o lead existente (Review Focus 2, item 13);
    - `update` válido → `COMPLETE` e consentimentos `terms` e `privacy` com `version '1.0'` e o sha256 do `LEGAL` (item 8);
    - `checkout` com lead incompleto → `PROFILE_INCOMPLETE`, sem intenção gravada (item 9);
    - `checkout` elegível → `url === goodgame.checkoutUrl` e uma intenção com `leadId` e `eventId` certos (itens 10, 11, 12);
    - o repositório em memória nunca recebe nada parecido com compra (item 14).
  - **`api.test.ts`:**
    - 401 sem `Authorization` e 401 com token que o verificador recusa (item 2);
    - 200 em `GET /me` com token válido (item 1);
    - 403 `GOOGLE_ONLY`;
    - 400 com `field 'phone'` e 400 com `field 'birthDate'` (itens 5, 6);
    - `POST /checkout` com `eventId 'evento-x'` → 404, e após o fechamento → 409 `EVENT_CLOSED` (Review Focus 3);
    - o corpo do `checkout` com `url` maliciosa é ignorado: a resposta traz sempre `goodgame.checkoutUrl`;
    - nenhuma resposta contém `googleSub` (`JSON.stringify(body)` não inclui `'g-1'`).
- [ ] **Step 2:** rodar `npx vitest run apps/landing-api`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npx vitest run apps/landing-api && npm run check`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(landing): API de cadastro e liberação do checkout com registro de intenção`.

### Task 5: Infraestrutura (`tom-prod-gg-landing`)

**Files:**
- Create: `infra/src/landing-stack.ts`.
- Test: `infra/test/landing-stack.test.ts`.
- Modify: `infra/src/build-app.ts` (instanciar com `auth.userPool`), `infra/cdk.json` (context `"landingCallbackUrls": ["http://localhost:5174/"]`).

**Interfaces:**
- Consumes: `UserPool` de `AuthStack` (prod), `nameOf`, `nameDefaultPolicy`.
- Produces: stack `tom-prod-gg-landing`, com os outputs `SiteUrl`, `SiteBucket`, `DistributionId`, `UserPoolClientId`, `LoginDomain`, consumidos pela Task 7.

Conteúdo da stack:

- **Tabela** `tom-prod-gg-leads`: `pk`/`sk` string, on-demand, TTL `expiresAt`, PITR, `deletionProtection`, `RETAIN`.
- **Cliente de app** `tom-prod-gg-site` no pool: sem secret, só o IdP `Google`, `authorizationCodeGrant`, escopos `openid email profile aws.cognito.signin.user.admin`, `callbackUrls` e `logoutUrls` vindos do context, tokens de acesso e ID de 60 minutos, refresh de 30 dias, `enableTokenRevocation`, `preventUserExistenceErrors`.
- **Lambda** `tom-prod-gg-landing-api`: o mesmo bloco do `api-stack` (Node 22, arm64, 256 MB, 10 s, role própria, logs de 2 semanas, bundling com `--conditions source`). Entry `apps/landing-api/src/handler.ts`. Grant só de `GetItem`, `PutItem`, `Query` e `ConditionCheckItem` na tabela. `reservedConcurrentExecutions: 10`, como limite contra abuso.
- **Function URL** `NONE`.
- **Bucket do site** e **CloudFront**: copiar o bloco do `web-stack`, com nomes `gg-…`, a CSP com `img-src 'self' data:` e `connect-src 'self' https://cognito-idp.us-east-2.amazonaws.com <loginDomain>`, e a mesma função de rotas SPA.
- **Os mesmos acknowledges do cdk-nag** com as mesmas razões.

O callback vem do context para não criar ciclo: distribuição → URL da função → env com o client id → cliente → URL da distribuição. O primeiro deploy usa só localhost. A Task 8 adiciona a URL do CloudFront e faz o redeploy.

- [ ] **Step 1:** teste que falha, no padrão de `infra/test/api-stack.test.ts`:
  - região `us-east-2`;
  - tabela com `TimeToLiveSpecification.AttributeName 'expiresAt'` e `DeletionProtectionEnabled true`;
  - Lambda com `LEADS_TABLE`, `USER_POOL_CLIENT_ID` e `ReservedConcurrentExecutions 10`;
  - `AWS::Cognito::UserPoolClient` com `SupportedIdentityProviders ['Google']` e `AllowedOAuthScopes` contendo `profile`;
  - CloudFront com o behavior `/api/*`;
  - nenhuma referência às tabelas do TOM (`template.toJSON()` sem `tom-prod-accounts`);
  - nenhum erro do cdk-nag (o mesmo padrão dos outros testes de stack).
- [ ] **Step 2:** rodar `npx vitest run infra/test/landing-stack.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npx vitest run infra && npm run check` e depois `npm run cdk -- synth tom-prod-gg-landing --profile tom`. Esperado: PASS e síntese sem erros.
- [ ] **Step 5:** commit `feat(landing): stack AWS da landing (tabela, API, cliente de login e CloudFront)`.

### Task 6: Site da landing (`apps/landing`)

**Files:**
- Create: `apps/landing/{package.json,index.html,vite.config.ts,tsconfig.json}`.
  - Copiar de `apps/web`, com `@tom/landing` e porta `5174`.
  - Proxy `/api` para `LANDING_DEV_API` (env; sem padrão: avisar se faltar).
  - Dependências: `@tom/landing-core`, `@tom/web-auth`, `preact`, `lucide-preact`.
- Create: `apps/landing/public/config.json`, para desenvolvimento local: `{ region, userPoolClientId, loginDomain }`.
- Create: `apps/landing/public/events/ots-genesys-2026-11-21.jpeg` e `ots-avancado-2026-11-22.jpeg`, copiados de `Assets/Yu-Gi-Oh!/`.
- Create: `apps/landing/public/logo-180.png`, copiado de `apps/web/src/assets/`.
- Create: `apps/landing/src/{main.tsx,app.tsx,api.ts,utm.ts,markdown.ts,theme.css}` e `src/screens/{events.tsx,profile-form.tsx,legal.tsx}`.
- Test: `apps/landing/test/{utm,markdown,flow}.test.ts`.
- Modify: `vitest.config.ts` (nada, porque `apps/*/test` já está incluído) e `package.json` raiz (scripts `landing:dev`, `landing:deploy`).

**Interfaces:**
- Consumes: `@tom/web-auth` (`createGoogle` com `scope` contendo `profile`, `createSession`, `browserStorage`) e `@tom/landing-core` (`validProfile`, `cleanUtm`, `LEGAL`, os tipos).
- Produces:

```ts
// utm.ts
export const captureUtm: (search: string, store: { get(): string | null; set(v: string): void }) => Utm; // URL com utm_* → grava; sem → lê o gravado; nada → direct
// markdown.ts
export const renderLegal: (md: string) => Block[]; // { kind: 'h1'|'h2'|'p'|'li'; text }[] — sem HTML cru
// flow.ts
export type Step = 'browse' | 'login' | 'profile' | 'redirecting';
export const nextStep: (s: { loggedIn: boolean; me: MeView | null; wantsEvent: string | null }) => Step;
```

Rotas: `/` (landing), `/termos` e `/privacidade` (exibem a versão vigente do `LEGAL`) e `/legal/*.md`, os arquivos estáticos.

O fluxo:

1. A pessoa clica em "Comprar ingresso".
2. O `eventId` desejado fica guardado no `sessionStorage`.
3. Sem login, vai para o Google; na volta, chama `GET /me?utm…`.
4. Se faltar dado, abre o formulário, com nome pré-preenchido, e-mail só leitura e validação por `validProfile`, mostrando o erro no campo. O formulário tem o checkbox obrigatório "Li e aceito os [Termos de Uso] e a [Política de Privacidade]" e o checkbox opcional, desmarcado, "Quero receber novidades e eventos da GoodGame".
5. Em seguida chama `POST /checkout` e faz `location.assign(url da resposta)`.

Os erros 409 e 404 da API aparecem com texto amigável (`EVENT_CLOSED` → "Inscrições encerradas para este torneio").

Visual:

- Fundo preto, vermelho `#c8102e` e destaques dourados, como nas artes.
- Logo no topo.
- Cards dos 2 torneios com a arte, a data, a hora, o preço, o local e o botão.
- Mobile-first, seguindo a skill `frontend-preact` (Core Web Vitals e acessibilidade: labels, foco, contraste AA).
- Rodapé com os links dos Termos e da Política, mais o CNPJ e o contato.

- [ ] **Step 1:** testes que falham:
  - `captureUtm('?utm_source=Instagram', s)` → `source 'instagram'` e grava;
  - `captureUtm('?code=abc&state=x', s)`, com o gravado anterior, devolve `instagram` (Review Focus 1);
  - `renderLegal('# T\n\nParágrafo <b>x</b>\n\n- item')` devolve 3 blocos, com o texto literal `<b>x</b>` (sem interpretar HTML);
  - `nextStep`: sem login e com evento escolhido → `login`; com login e `me.missing` não vazio → `profile`; completo → `redirecting`; sem evento → `browse`.
- [ ] **Step 2:** rodar `npx vitest run apps/landing`. Esperado: FAIL.
- [ ] **Step 3:** implementar os módulos e as telas.
- [ ] **Step 4:** rodar `npx vitest run apps/landing && npm run check && npm run build -w @tom/landing`. Esperado: PASS e build gerado em `apps/landing/dist`.
- [ ] **Step 5:** abrir `npm run landing:dev` e conferir com a skill `browser-automation`: a página carrega sem erro no console, os 2 cards aparecem e o layout em 390 px não tem rolagem horizontal. Tirar screenshot.
- [ ] **Step 6:** commit `feat(landing): site da landing com cadastro e termos`.

### Task 7: Publicação e documentação

**Files:**
- Create: `infra/scripts/publish-site.ts`, extraindo de `deploy-web.ts` a função `publishSite(opts: { stack: string; workspace: string; distDir: string; config: Record<string, unknown> }): Promise<string /* SiteUrl */>`.
- Modify: `infra/scripts/deploy-web.ts` (passa a usar `publishSite`, com o mesmo comportamento).
- Create: `infra/scripts/deploy-landing.ts`:
  1. as mesmas checagens de login da AWS do `deploy.ts`;
  2. `npx cdk deploy tom-prod-gg-landing --exclusively`;
  3. `publishSite`, com o config a partir dos outputs `UserPoolClientId`, `LoginDomain` e `region`.
- Create: `docs/landing-goodgame.md`, com a Etapa 9 da spec:
  - fluxo de autenticação, de cadastro e de liberação;
  - estrutura dos dados (a tabela do design);
  - fluxo da intenção;
  - onde trocar o link e os eventos (`packages/landing-core/src/stores/goodgame.ts`);
  - como publicar uma nova versão dos termos (arquivo novo, mais `LEGAL`, mais o teste de hash);
  - variáveis (`LEADS_TABLE`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `LANDING_DEV_API`);
  - context `landingCallbackUrls`;
  - como testar (`npm test`, `npm run landing:dev`);
  - como trocar para `evento.ggtcg.com.br` (certificado ACM em us-east-1, `domainNames` na distribuição, CNAME na Cloudflare e a URL nova em `landingCallbackUrls`).
- Modify: `docs/privado/operacao.md` (seção curta "Landing GoodGame", com os comandos e o link para o doc) e `README.md` (uma linha).

- [ ] **Step 1:** rodar `npm run check`. Esperado: verde, com o `deploy-web` refatorado sem quebrar os testes de infra.
- [ ] **Step 2:** commit `feat(landing): script de publicação e documentação`.
- [ ] **Step 3:** push e PR para `main` com o resumo e o Security Check. O merge fica com o usuário.

### Task 8: Ir ao ar (só com autorização do usuário)

- [ ] **Step 1:** pedir autorização. Depois `npm run landing:deploy` (1º deploy). Anotar o `SiteUrl`.
- [ ] **Step 2:** colocar `SiteUrl + '/'` em `landingCallbackUrls` (`infra/cdk.json`), commitar e rodar `npm run landing:deploy` de novo.
- [ ] **Step 3:** com autorização, como operação no pool de produção (aditiva), mapear o nome do Google: `aws cognito-idp update-identity-provider --profile tom --user-pool-id <pool> --provider-name Google --attribute-mapping email=email,email_verified=email_verified,name=name`. Antes, conferir com `describe-identity-provider` que o mapeamento atual é exatamente esse, sem o `name`. Sem esse passo, o nome só não vem pré-preenchido.
- [ ] **Step 4:** teste ponta a ponta com o usuário: abrir `SiteUrl/?utm_source=instagram&utm_campaign=ots`, entrar com o Google, completar o cadastro e clicar em comprar. Deve abrir a LigaMagic. Depois `aws dynamodb query` na tabela, para conferir o lead e a intenção com `source 'instagram'`.
- [ ] **Step 5:** entregar ao usuário o link com UTM para o anúncio e a lista de pendências: revisão dos termos, fase 2 e domínio próprio.
