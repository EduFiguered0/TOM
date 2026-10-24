# Login com senha e conta Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o login por código no e-mail por e-mail + senha (sem código no cadastro) e conta Google, mantendo conta única por e-mail e sessão única por dispositivo.

**Architecture:** o Cognito continua sendo o login. Um gatilho de pré-cadastro (Lambda inline) confirma e marca o e-mail como verificado na hora, então nenhum e-mail sai no cadastro; o único e-mail é o de "Esqueci minha senha". O Google entra pelo domínio de login do Cognito (OAuth com PKCE), ligado por uma flag de contexto do CDK depois que o provedor existir. O `Identity` passa a dizer de qual provedor veio o login, e só o Google pode ser ligado a uma conta existente pelo e-mail.

**Tech Stack:** TypeScript, Preact, Vitest, AWS CDK (Cognito, Lambda Node 22 Arm), `aws-jwt-verify`.

**Spec:** `docs/superpowers/specs/2026-10-24-eventos-qr-design.md` (seção "Login"); base em `docs/spec-tom.md`.

Plano 1 de 5 da spec (depois: Player ID sem conferência e home pública; equipe e juízes; ciclo do evento com QR; histórico).

## Global Constraints

- Região us-east-2, perfil `tom`; nenhum recurso fora dela.
- Custo como critério principal: nada pago novo; o gatilho Lambda fica na franquia (US$ 0).
- "O único e-mail enviado é o de 'Esqueci minha senha'."
- "O Google só é aceito com e-mail verificado."
- "Um cadastro com senha num e-mail que já pertence a uma conta […] é recusado" — só o Google liga login novo a conta existente.
- Sessão única e troca de dispositivo continuam como hoje (`POST /session`, `session_inactive`).
- Textos de tela e de erro em pt-BR.
- `npm run check` verde ao fim de cada tarefa; testes reais só com `npm run test:aws`.
- Deploy com mudança de IAM é feito pelo usuário num terminal interativo (`npm run cdk -- deploy … --profile tom`).

## Review Focus

1. Voltar do Google com `?error=` (usuário cancelou) ou com `state` diferente do salvo: volta à tela de login com mensagem, sem trocar código nem quebrar. → teste na Tarefa 5.
2. Cadastro com senha num e-mail que já tem conta (Google ou senha): mensagem clara e nunca ligação automática. → testes nas Tarefas 1 e 2.
3. Conta antiga, criada pelo código por e-mail (sem senha): "Esqueci minha senha" funciona e depois entra com a senha. → conferência manual em produção na Tarefa 7 (Step 5).
4. Tokens vindos do Google renovam pelo mesmo `REFRESH_TOKEN_AUTH` e o `GET /me` consegue ler o e-mail (escopo `aws.cognito.signin.user.admin`). → teste na Tarefa 3 (escopo) e conferência manual na Tarefa 7.
5. Senha fraca ou e-mail inválido no cadastro: mensagem em português, nada criado. → teste na Tarefa 4.

---

### Task 1: Provedor do login no `Identity` e regra de ligação

**Files:**
- Modify: `packages/core/src/identity/account-service.ts`
- Test: `packages/core/test/identity/account-service.test.ts`

**Interfaces:**
- Produces: `Identity.provider: 'password' | 'google'` (campo novo, obrigatório). `AccountService.linkLogin(identity, email)` recusa `provider: 'password'`.

- [ ] **Step 1: Write the failing tests** (no helper `identity()` do teste, o padrão passa a ser `provider: 'password'`; o caso Google existente usa `provider: 'google'`)

```ts
it('senha num e-mail que já tem conta: recusa e não liga', async () => {
  await service.register(identity({ login: 'login-google', provider: 'google' }), 'ana@example.com', { profile: adult, playerId: null });
  const senha = identity({ login: 'login-senha', provider: 'password' });
  await rejects(service.linkLogin(senha, 'Ana@Example.com'), 'account_exists');
  await rejects(service.authenticate(senha), 'account_not_found');
});

it('mensagem da recusa orienta a entrar com a conta existente', async () => {
  await service.register(identity({ login: 'a', provider: 'password' }), 'ana@example.com', { profile: adult, playerId: null });
  await expect(service.linkLogin(identity({ login: 'b', provider: 'password' }), 'ana@example.com'))
    .rejects.toThrow('Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.');
});
```

- [ ] **Step 2: Run** `npx vitest run packages/core/test/identity/account-service.test.ts` — Expected: FAIL (tipo sem `provider` / ligação aceita).

- [ ] **Step 3: Implement** — `provider` em `Identity` (comentário: "de onde veio o login; só o Google prova o e-mail"). Em `linkLogin`: sem conta → `notFound()` (como hoje); com conta e `provider === 'password'` → `CommandRejected('account_exists', 'Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.')`. `register` usa a mesma mensagem em `accountExists()`. Atualize os comentários que citam "código por e-mail".

- [ ] **Step 4: Run** `npm run check` — Expected: PASS (corrija os outros usos de `Identity` que o typecheck apontar só adicionando `provider`).

- [ ] **Step 5: Commit** — `feat: só o Google liga login novo a conta existente`

### Task 2: API lê o provedor do token

**Files:**
- Modify: `apps/api/src/cognito.ts`, `apps/api/test/support.ts`
- Test: `apps/api/test/api.test.ts`, `apps/api/test/cognito.test.ts` (criar, se não existir teste do verificador)

**Interfaces:**
- Consumes: `Identity.provider` (Tarefa 1).
- Produces: `providerOf(username: string): 'password' | 'google'` exportada de `apps/api/src/cognito.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// cognito.test.ts
expect(providerOf('Google_1234567890')).toBe('google');
expect(providerOf('google_1234567890')).toBe('google');
expect(providerOf('3b1f0c2e-aaaa-bbbb-cccc-1234567890ab')).toBe('password');

// api.test.ts
it('senha depois do Google no mesmo e-mail: 409 com orientação', async () => {
  const { call } = setup();
  await register(call, 'ana-google:g1');
  const res = await call('GET', '/me', 'ana-senha:s1');
  expect(res).toMatchObject({ status: 409, body: { error: 'account_exists' } });
});
```

No `support.ts`: o token falso deriva `provider` do login (`login.includes('google') ? 'google' : 'password'`) e `EMAILS` ganha `'ana-senha': 'ana@example.com'`.

- [ ] **Step 2: Run** `npx vitest run apps/api` — Expected: FAIL.

- [ ] **Step 3: Implement** — `providerOf` por `/^google_/i` sobre o claim `username` do token de acesso; `CognitoTokenVerifier.verify` devolve `provider: providerOf(payload.username)`.

- [ ] **Step 4: Run** `npm run check` — Expected: PASS (o teste "Google depois do código por e-mail" continua verde).

- [ ] **Step 5: Commit** — `feat: API identifica login por senha ou Google`

### Task 3: Cognito com senha, gatilho de pré-cadastro e Google opcional

**Files:**
- Modify: `infra/src/auth-stack.ts`, `infra/src/build-app.ts`, `infra/src/web-stack.ts` (CSP), `infra/cdk.json`
- Test: `infra/test/auth-stack.test.ts`, `infra/test/web-stack.test.ts`

**Interfaces:**
- Produces: `AuthStackProps.google: boolean` e `AuthStackProps.callbackUrls: string[]`; output `GoogleEnabled` (`'true' | 'false'`) além dos atuais `UserPoolClientId` e `LoginDomain`. `WebStackProps.loginDomain: string`.

Valores fixados:
- `signInPolicy.allowedFirstAuthFactors: { password: true }` (sai `emailOtp`).
- `passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true, requireUppercase: false, requireSymbols: false }`. Acknowledge `AwsSolutions-COG1` com o motivo "jogadores, inclusive crianças, digitam no celular; 8 caracteres com letras e números".
- `userVerification` (usado pelo "Esqueci minha senha"): assunto `Código para criar sua senha - Torneios TOM`; corpo `Olá! Seu código para criar uma nova senha é {####}. Se você não pediu, ignore este e-mail.`
- Gatilho `PRE_SIGN_UP`: `Function` com `Code.fromInline`, Node 22, Arm, 128 MB, role e log group de 14 dias explícitos (mesmo padrão de `api-stack.ts`). Corpo exato:

```js
exports.handler = async (event) => {
  if (event.triggerSource === 'PreSignUp_SignUp') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }
  return event;
};
```

- Cliente: `refreshTokenValidity: Duration.days(365)` (o jogador entra uma vez por mês).
- Com `google: true` (só `TomAuth`, lido de `app.node.tryGetContext('google') === true`): `supportedIdentityProviders: [COGNITO, custom('Google')]`, `oAuth: { flows: { authorizationCodeGrant: true }, scopes: [OPENID, EMAIL, COGNITO_ADMIN], callbackUrls, logoutUrls: callbackUrls }`. `callbackUrls` = `['https://dvaep2eni3fqm.cloudfront.net/', 'http://localhost:5173/']` em `build-app.ts`. `TomAuthTest` fica sempre com `google: false`.
- `infra/cdk.json`: `"google": false` no `context` (o usuário troca para `true` depois de criar o provedor; Tarefa 7).
- CSP do site: `connect-src` ganha o domínio de login (troca do código do Google pelo token).

- [ ] **Step 1: Write the failing tests** — em `auth-stack.test.ts`: troque o teste de `EMAIL_OTP` por `AllowedFirstAuthFactors: ['PASSWORD']` e `PasswordPolicy` com `MinimumLength: 8`; `LambdaConfig.PreSignUp` presente; `RefreshTokenValidity: 525600`; assunto novo do e-mail; com `new App({ context: { google: true } })` o cliente de `TomAuth` tem `SupportedIdentityProviders: ['COGNITO', 'Google']`, `AllowedOAuthScopes` contendo `aws.cognito.signin.user.admin` e `CallbackURLs` com as duas URLs; `TomAuthTest` sem `AllowedOAuthFlows`. Em `web-stack.test.ts`: a CSP contém `tom-pokemon-login.auth.us-east-2.amazoncognito.com`. Teste do corpo do gatilho: avaliar a string inline com um evento `PreSignUp_SignUp` (confirma e verifica) e `PreSignUp_ExternalProvider` (não mexe).

- [ ] **Step 2: Run** `npx vitest run infra` — Expected: FAIL.

- [ ] **Step 3: Implement** conforme os valores acima. Atualize o comentário da classe ("Login: e-mail e senha, ou Google…") e o acknowledge `AwsSolutions-COG2` (agora há senha; MFA desligado de propósito).

- [ ] **Step 4: Run** `npm run check` — Expected: PASS, cdk-nag sem erro novo.

- [ ] **Step 5: Commit** — `feat: Cognito com senha, cadastro sem código e Google opcional`

### Task 4: Cliente Cognito do site com senha

**Files:**
- Modify: `apps/web/src/auth/cognito.ts`
- Test: `apps/web/test/auth.test.ts`

**Interfaces:**
- Produces (substituem `start`/`verify`/`PendingCode`):
  - `signUp(email: string, password: string): Promise<Tokens>` — `SignUp` com `Password`, depois `InitiateAuth` `USER_AUTH` com `{ USERNAME, PASSWORD, PREFERRED_CHALLENGE: 'PASSWORD' }`.
  - `signIn(email: string, password: string): Promise<Tokens>` — o mesmo `InitiateAuth`.
  - `forgotPassword(email: string): Promise<void>` — `ForgotPassword`.
  - `resetPassword(email: string, code: string, password: string): Promise<void>` — `ConfirmForgotPassword` (código só com dígitos).
  - `refresh` e `revoke` ficam como estão. E-mail sempre `trim().toLowerCase()`.

Mensagens (`MESSAGES`): `NotAuthorizedException` → `E-mail ou senha incorretos.`; `UsernameExistsException` → `Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.`; `InvalidPasswordException` → `A senha precisa ter pelo menos 8 caracteres, com letras e números.`; `CodeMismatchException` e `ExpiredCodeException` mantêm o texto atual; `UserNotFoundException` → mesma de `NotAuthorizedException`.

- [ ] **Step 1: Write the failing tests** (substituem o bloco "login sem senha")

```ts
it('cadastro: cria com senha e já entra, sem código', async () => {
  const { calls, fetchFn } = fakeCognito({ SignUp: { body: { UserConfirmed: true } }, InitiateAuth: auth('acesso', 'renovacao') });
  expect(await createCognito(config, fetchFn, () => 0).signUp(' Ana@Example.COM ', 'senha123'))
    .toEqual({ access: 'acesso', refresh: 'renovacao', expiresAt: 900_000 });
  expect(calls.map((c) => c.action)).toEqual(['SignUp', 'InitiateAuth']);
  expect(calls[0]?.body).toMatchObject({ Username: 'ana@example.com', Password: 'senha123' });
  expect(calls[1]?.body).toMatchObject({ AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: 'ana@example.com', PASSWORD: 'senha123', PREFERRED_CHALLENGE: 'PASSWORD' } });
});
it('senha errada vira "E-mail ou senha incorretos."', …);        // NotAuthorizedException no InitiateAuth
it('senha fraca no cadastro vira mensagem e não tenta entrar', …); // InvalidPasswordException no SignUp; calls = ['SignUp']
it('esqueci a senha: pede o código e redefine com o código só em dígitos', …); // ConfirmationCode '123456' de '123 456'
```

- [ ] **Step 2: Run** `npx vitest run apps/web/test/auth.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** as quatro funções; atualize o comentário do arquivo. Para o projeto continuar compilando, troque em `login.tsx` só o formulário atual por e-mail + senha chamando `signIn` (a tela completa vem na Tarefa 6).

- [ ] **Step 4: Run** `npm run check` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: cliente do Cognito com e-mail e senha`

### Task 5: Entrar com o Google (PKCE)

**Files:**
- Create: `apps/web/src/auth/google.ts`
- Modify: `apps/web/src/main.tsx`, `apps/web/public/config.json`, `infra/scripts/deploy-web.ts`
- Test: `apps/web/test/google.test.ts`

**Interfaces:**
- Consumes: `Tokens` de `auth/cognito.ts`.
- Produces:
  - `interface GoogleConfig { loginDomain: string; clientId: string; redirectUri: string }`
  - `createGoogle(config: GoogleConfig, deps: { fetchFn: typeof fetch; store: { get(): string | null; set(v: string): void; clear(): void }; random: () => Uint8Array; now: () => number })`, que devolve:
    - `authorizeUrl(): Promise<string>` — gera `verifier` (43+ caracteres base64url) e `state`, guarda `{ verifier, state }` em `store`, monta `${loginDomain}/oauth2/authorize?identity_provider=Google&response_type=code&client_id&redirect_uri&scope=openid email aws.cognito.signin.user.admin&state&code_challenge&code_challenge_method=S256`.
    - `finish(search: string): Promise<Tokens | { error: string } | null>` — `null` se não houver `code` nem `error` na URL; `{ error: 'Entrada pelo Google cancelada.' }` com `error=`; `{ error: 'Não foi possível entrar pelo Google. Tente de novo.' }` se `state` não bater ou não houver nada salvo; senão `POST ${loginDomain}/oauth2/token` (`application/x-www-form-urlencoded`: `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`) e converte `access_token`/`refresh_token`/`expires_in` em `Tokens`. Sempre limpa o `store`.
- `config.json` ganha `loginDomain` e `google` (boolean). `deploy-web.ts` lê os outputs `LoginDomain` e `GoogleEnabled` de `TomAuth`; `public/config.json` (desenvolvimento, pool de testes) fica com `"google": false`.
- `main.tsx`: antes de montar o `App`, se `google.finish(location.search)` devolver `Tokens`, chama `session.signedIn` e limpa a URL com `history.replaceState(null, '', '/')`; se devolver `{ error }`, passa a mensagem para o `App` mostrar na tela de login. `store` em `sessionStorage` (chave `tom.google`), com try/catch como `browserStorage`.

- [ ] **Step 1: Write the failing tests** — URL de autorização tem todos os parâmetros acima e `code_challenge` = SHA-256 base64url do `verifier` salvo; `finish('?code=abc&state=<salvo>')` troca no endpoint de token com o corpo exato e devolve `Tokens`; `finish('?error=access_denied&state=x')` devolve a mensagem de cancelado sem chamar `fetch`; `state` diferente devolve a mensagem de falha sem chamar `fetch`; `finish('')` devolve `null`; o `store` fica vazio depois de qualquer `finish` com parâmetros.

- [ ] **Step 2: Run** `npx vitest run apps/web/test/google.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `google.ts` com `crypto.subtle.digest` para o desafio; ligar em `main.tsx` e `deploy-web.ts`.

- [ ] **Step 4: Run** `npx vitest run apps/web/test/google.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat: entrar com o Google pelo domínio de login do Cognito`

### Task 6: Tela de login

**Files:**
- Modify: `apps/web/src/screens/login.tsx`, `apps/web/src/app.tsx`, `apps/web/src/styles.css` (só se precisar)
- Test: verificação no navegador (skill `browser-automation`), sem teste unitário de tela (padrão atual do projeto)

**Interfaces:**
- Consumes: `signUp`, `signIn`, `forgotPassword`, `resetPassword` (Tarefa 4); `createGoogle(...).authorizeUrl()` (Tarefa 5).
- `Login` recebe `google: { authorizeUrl(): Promise<string> } | null` e `initialError: string | null`.

Comportamento:
- Três modos na mesma tela: **Entrar** (e-mail, senha, "Entrar"), **Criar conta** (e-mail, senha, "Criar conta"; abaixo do campo: "Pelo menos 8 caracteres, com letras e números") e **Esqueci minha senha** (e-mail → "Enviar código"; depois código + nova senha → "Salvar senha", e volta ao modo Entrar com "Senha salva. Entre com a nova senha.").
- Botão "Entrar com o Google" no topo, só quando `google` não for `null`; ao clicar, `location.assign(await google.authorizeUrl())`.
- Campos com `autocomplete` corretos (`email`, `current-password`, `new-password`, `one-time-code`). O texto "Sem senha: enviamos um código…" sai.
- Erros aparecem em `<p class="error" role="alert">`, como hoje.

- [ ] **Step 1: Implement** a tela e a passagem de `google` e `initialError` em `app.tsx`.
- [ ] **Step 2: Run** `npm run check` — Expected: PASS.
- [ ] **Step 3: Verify** com `npm run web:dev` e a skill `browser-automation` em `http://localhost:5173`: os três modos alternam, sem erro no console; criar conta no pool de testes com uma senha fraca mostra a mensagem de senha; com uma senha válida cai na tela de cadastro (perfil).
- [ ] **Step 4: Commit** — `feat: tela de login com senha, Google e "Esqueci minha senha"`

### Task 7: Teste real, documentação e ativação do Google

**Files:**
- Modify: `apps/api/test/api.aws.test.ts`, `README.md`, `docs/spec-tom.md`

- [ ] **Step 1: Write the AWS test** em `api.aws.test.ts`: `SignUp` com senha no `TomAuthTest` devolve `UserConfirmed: true` e nenhum código é pedido; `InitiateAuth` `USER_AUTH` com senha devolve tokens; `GET /me` responde 404 e `POST /me` cadastra; `ForgotPassword` desse usuário responde com `CodeDeliveryDetails.DeliveryMedium === 'EMAIL'` (o e-mail ficou verificado pelo gatilho). A conta antiga sem senha é conferida à mão no Step 5, porque o pool novo não cria mais usuários sem senha.
- [ ] **Step 2: Deploy das stacks de teste** — o usuário roda, num terminal interativo: `npm run cdk -- deploy TomAuthTest TomApiTest --profile tom`.
- [ ] **Step 3: Run** `npm run test:aws` — Expected: PASS.
- [ ] **Step 4: Docs** — README: tabela de stacks ("e-mail e senha; Google"), fase 6 do status sem "Google pendente", e uma seção "Ativar o Google" com:
  1. No Google Cloud, criar o cliente OAuth "Aplicativo da Web" com o URI de redirecionamento `https://tom-pokemon-login.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`.
  2. `aws cognito-idp create-identity-provider --profile tom --user-pool-id <TomAuth.UserPoolId> --provider-name Google --provider-type Google --provider-details client_id=<id>,client_secret=<segredo>,authorize_scopes="openid email profile" --attribute-mapping email=email,email_verified=email_verified` (segredo só no terminal, nunca no repositório).
  3. Trocar `"google": false` para `true` em `infra/cdk.json`, rodar `npm run cdk -- deploy TomAuth --profile tom` e `npm run web:deploy`.

  `docs/spec-tom.md`: marcar o item do Google em "Decisões em aberto" como feito, trocar "código de uso único enviado ao e-mail" pela senha em "Conta e Player ID" e no fluxo, e acrescentar a revisão 4 no "Registro de decisões" (login com senha sem código no cadastro; e-mail só para redefinir a senha; só o Google liga login novo a conta existente).
- [ ] **Step 5: Deploy de produção** — o usuário roda `npm run cdk -- deploy TomAuth TomApi TomWeb --profile tom` e `npm run web:deploy`; conferir no celular: criar conta com senha, sair e entrar de novo, "Esqueci minha senha" com uma conta antiga. Depois do passo 4.3, conferir a entrada pelo Google e a renovação do token (deixar a aba 20 min e recarregar).
- [ ] **Step 6: Commit** — `docs: login com senha e Google`
