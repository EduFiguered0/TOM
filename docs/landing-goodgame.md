# Landing de ingressos — GoodGame

Landing dos torneios Yu-Gi-Oh! OTS Championship (21 e 22/11/2026). Ela exige login Google e um cadastro antes de liberar o link de compra na LigaMagic e registra de qual canal (UTM) cada pessoa veio. É um módulo isolado do TOM: não lê nem grava nenhuma tabela dele.

Design: [`docs/superpowers/specs/2026-11-17-landingpage-design.md`](superpowers/specs/2026-11-17-landingpage-design.md).

## Módulos

| Pasta | Papel |
| --- | --- |
| `packages/landing-core` | Regras sem dependências: validação do cadastro, UTM, eventos, liberação do checkout, termos vigentes |
| `apps/landing-api` | Lambda (Function URL atrás do CloudFront em `/api`): leads no DynamoDB, login Google conferido no servidor |
| `apps/landing` | Site Preact + Tailwind (vitrine, cadastro, termos) |
| `packages/web-auth` | Login Google com PKCE e sessão, compartilhado com o site do TOM |
| `infra/src/landing-stack.ts` | Stack `tom-prod-gg-landing`: tabela, Lambda, cliente de app no pool do Cognito, S3 e CloudFront |

## Fluxo

1. A pessoa chega pelo link do anúncio (`?utm_source=instagram&utm_campaign=…`). O site guarda a UTM na aba.
2. Clica em **Comprar ingresso**. O torneio escolhido também fica guardado na aba.
3. **Autenticação:** sem login, o site manda direto para o Google (Cognito, código + PKCE). Na volta, guarda os tokens.
4. **Cadastro:** `GET /api/me` reconhece a pessoa pelo `sub` do Google (username `google_<sub>` no Cognito) ou cria um lead `INCOMPLETE`, com nome, e-mail e primeira origem. Se faltar telefone, data de nascimento ou o aceite dos termos vigentes, o formulário abre e `PUT /api/me` valida e grava. CPF nunca é pedido.
5. **Liberação:** `POST /api/checkout` confere no servidor:
   - token válido e só de login Google;
   - lead `COMPLETE`;
   - aceite dos termos na versão vigente;
   - evento existente e ainda não fechado (`salesCloseAt`).

   Com tudo certo, grava a **intenção** `REDIRECTED` e devolve o link da configuração. O site só navega para o link que a API devolveu.
6. A compra acontece na LigaMagic. **Intenção não é venda.**

Respostas de recusa: `PROFILE_INCOMPLETE` / `TERMS_OUTDATED` / `EVENT_CLOSED` (409), `EVENT_NOT_FOUND` (404), `GOOGLE_ONLY` (403), `UNAUTHORIZED` (401), `INVALID` com `field` (400).

## Dados (tabela `tom-prod-gg-leads`, TTL `expiresAt` = 6 meses, renovado a cada gravação)

| Item | pk | sk |
| --- | --- | --- |
| Lead | `store#goodgame#lead#<leadId>` | `lead` |
| Trava do Google (sem duplicidade) | `store#goodgame#google#<googleSub>` | `lock` |
| Consentimento (histórico, só acréscimos) | `store#goodgame#lead#<leadId>` | `consent#<iso>#<terms\|privacy\|marketing>` |
| Intenção de compra | `store#goodgame#lead#<leadId>` | `intent#<iso>#<intentId>` |

- O **lead** guarda nome completo, e-mail, telefone, data de nascimento, status, opt-in de marketing, primeira origem, datas de criação e atualização, e a versão (controle de concorrência).
- Cada **consentimento** guarda a versão, o SHA-256 do texto aceito e a data e hora.
- A **compra confirmada** (fase 2) é uma estrutura separada e só nasce da importação do relatório da LigaMagic.

## Configuração

- **Eventos e link da LigaMagic:** `packages/landing-core/src/stores/goodgame.ts` (`checkoutUrl`, `events[].salesCloseAt`). Mudou, faça um novo deploy.
- **Termos e Política:** arquivos imutáveis em `apps/landing/public/legal/`. Para uma nova versão:
  1. crie o arquivo `termos-v1.1.md`;
  2. atualize `version`, `path` e `sha256` em `packages/landing-core/src/legal.ts`.

  O teste `legal.test.ts` confere o hash e impede editar uma versão já publicada. Quem aceitou uma versão antiga aceita de novo antes de comprar.
- **Variáveis da Lambda** (definidas pela stack): `LEADS_TABLE`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`.
- **Desenvolvimento local:**
  - `LANDING_DEV_API=<Function URL> npm run landing:dev` (porta 5174);
  - `apps/landing/public/config.json` precisa do `userPoolClientId` da stack.
- **Endereços de volta do login:** `landingCallbackUrls` em `infra/cdk.json`. Eles ficam fora da stack para evitar uma dependência circular com o CloudFront.

## Publicar

```bash
npm run landing:deploy        # stack tom-prod-gg-landing + site (perfil AWS tom)
```

No primeiro deploy, coloque o `SiteUrl` (com `/` no fim) em `landingCallbackUrls` e rode de novo.

**Domínio amigável** (ex.: `evento.ggtcg.com.br`):

1. Crie o certificado ACM em us-east-1.
2. Coloque o domínio e o certificado em `domainNames`/`certificate` da distribuição.
3. Crie o CNAME na Cloudflare apontando para o `*.cloudfront.net`.
4. Inclua a nova URL em `landingCallbackUrls` e faça o deploy.

## Testes

```bash
npm test                                   # tudo
npx vitest run packages/landing-core apps/landing-api apps/landing infra/test/landing-stack.test.ts
```

Os testes cobrem: autenticação válida e inválida, reconhecimento de lead existente, criação de lead novo, telefone e data de nascimento obrigatórios, ausência de CPF, aceite obrigatório, bloqueio de cadastro incompleto, liberação para lead elegível, registro da intenção, ligação entre lead e evento, lead sem duplicidade (inclusive em cliques simultâneos) e nenhuma compra criada a partir de uma intenção.
