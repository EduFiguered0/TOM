# Landing de ingressos GoodGame — Design

Data: 2026-11-17 · Origem: `2026-11-17-landingpage.md` (requisitos) + brainstorming de 2026-11-17.

## Intenção

A GoodGame vai anunciar no Instagram os torneios de **Yu-Gi-Oh!** OTS Championship. Ela quer saber, depois do evento, **quantas vendas vieram do anúncio** (via esta landing) e quantas de outros canais, para investir no canal que vende e **aumentar a venda online**. A venda continua na loja da GoodGame na LigaMagic (`www.ggtcg.com.br`). A landing pede login Google e cadastro antes de liberar o link de compra. Assim a loja ganha um lead identificado e a origem do clique. Depois do evento, as vendas importadas da LigaMagic são cruzadas com esses leads.

Hoje só a GoodGame usa o módulo, mas ele vai virar parte do SaaS para lojas. Por isso os dados já nascem separados por loja.

## Metas, não-metas, antimetas

- **Metas:** landing no ar **hoje (2026-11-17)**. Origem (UTM) gravada em cada intenção de compra. Leads sem duplicidade. Termos e Política versionados com o aceite registrado. Números por canal até o fim do evento.
- **Não-metas:** cadastro de lojas ou tela para criar eventos. Integração com a LigaMagic por API, webhook ou scraping. Pagamento próprio. Qualquer ligação com contas ou torneios do TOM (Pokémon).
- **Antimetas:**
  - Tratar clique ou redirecionamento como venda.
  - Pedir ou guardar CPF.
  - Deixar a liberação do link só no frontend.
  - Atrito a mais do que o necessário: cada tela extra derruba venda. O cadastro tem **uma tela**, e quem já tem cadastro vai direto para a LigaMagic.

## Restrições

- Tudo em us-east-2 (o CloudFront é global, sem Lambda@Edge). Perfil AWS `tom`. Custo o mais perto de zero possível.
- Mesma stack do repositório: TypeScript, Preact + Tailwind (skill `frontend-preact`), Lambda com Function URL atrás do CloudFront, DynamoDB on-demand, CDK com cdk-nag e Vitest.
- **Retenção de 6 meses:** TTL de 180 dias em todo item, renovado a cada nova gravação do lead.
- LGPD: só os dados listados abaixo. Exclusão a pedido (por e-mail do contato; a tela fica fora do MVP).
- Deploy em produção só com autorização do usuário.

## Eventos (configuração, não código)

Os dois eventos têm o mesmo link de compra: `https://www.ggtcg.com.br/?view=ecom/itens&cat=214899&ing=1`.

| id | Nome | Data | Hora | Ingresso | Local |
| --- | --- | --- | --- | --- | --- |
| `ots-genesys-2026-11-21` | OTS Championship Genesys | 2026-11-21 | 11:00 | R$ 75,00 | Estr. do Mendanha, 646 – loja B, Campo Grande, Rio de Janeiro |
| `ots-avancado-2026-11-22` | OTS Championship Avançado | 2026-11-22 | 11:00 | R$ 75,00 | idem |

As artes estão em `Assets/Yu-Gi-Oh!/` e a logo em `apps/web/src/assets/`. A configuração fica num arquivo versionado do módulo (`stores/goodgame.ts` ou JSON equivalente), com `storeId: "goodgame"`. A API lê **o link de compra só no servidor** e nunca aceita uma URL vinda do cliente.

## Abordagens consideradas

- **A) Página dentro do site do TOM.** Seria a mais rápida, mas mistura a marca GoodGame com o TOM e o subdomínio futuro mostraria o TOM. Descartada.
- **B) Módulo próprio no mesmo repositório (escolhida).** App, API, tabela e distribuição CloudFront próprios. Reaproveita os padrões de `web-stack`, `api-stack` e `names` e o pool do Cognito, com um cliente de app separado. Isola o módulo e permite trocar o endereço sem tocar no TOM.
- **C) Repositório separado.** Duplicaria CI, CDK e deploy na mesma conta AWS sem ganho real. Descartada.

## Decisões de como (tomadas no brainstorming)

1. **Código:**
   - `apps/landing`: Preact + Vite + Tailwind, com o visual vermelho e preto das artes e a logo GoodGame.
   - Domínio puro (lead, consentimento, intenção, compra, elegibilidade) num pacote ou pasta própria, sem importar nada de identity ou tournament do TOM.
   - API num handler próprio (`apps/landing-api` ou equivalente).
2. **Infra:**
   - Stack `tom-prod-gg-landing`: Lambda + Function URL, tabela DynamoDB `tom-prod-gg-leads`, bucket do site e distribuição CloudFront.
   - Stack gêmea `tom-test-gg-*` para os testes reais, seguindo o padrão atual.
3. **Endereço:** o padrão do CloudFront (`*.cloudfront.net`) no início. Fica preparado para receber um nome alternativo (`evento.ggtcg.com.br`, com certificado ACM em us-east-1 e CNAME na Cloudflare) por configuração, sem recriar a distribuição.
4. **Login:**
   - Mesmo pool do Cognito de produção (`ggtcg-login`, com o Google já configurado), com um **cliente de app novo** criado na stack da landing.
   - A URL de retorno do login é a da distribuição da landing.
   - O fluxo segue o mesmo de `apps/web/src/auth/google.ts` (código + PKCE, direto para o Google), com escopo `openid email profile aws.cognito.signin.user.admin`.
   - O backend confere o access token com `aws-jwt-verify` (cliente da landing) e aceita **só** usuário federado Google (username `google_<sub>`).
5. **Identificação:**
   - O lead é identificado pelo `sub` do Google, extraído do username `google_<googleSub>`, e também guarda o `sub` do Cognito.
   - O e-mail nunca serve, sozinho, como chave.
   - Trava de unicidade por `(storeId, googleSub)`.
6. **Um lead por loja.** A mesma pessoa em outra loja seria outro lead. O lead se liga aos eventos pelas intenções de compra, sem criar um lead novo por evento.
7. **Cadastro complementar (uma tela):**
   - Nome completo e e-mail vêm pré-preenchidos pelo Google. O e-mail não é editável: é o verificado pelo Google.
   - Telefone com DDD, obrigatório: 10 ou 11 dígitos, Brasil.
   - Data de nascimento completa, obrigatória, válida e no passado.
   - Aceite obrigatório de Termos e Política. Opt-in opcional de marketing, desmarcado por padrão.
   - Validação igual no front e no back. Nenhum campo de CPF.
   - A pessoa pode atualizar os dados depois.
8. **Termos e Política versionados (prática de mercado):**
   - Arquivos Markdown imutáveis por versão: `apps/landing/legal/termos/v1.0.md` e `privacidade/v1.0.md`.
   - Publicados em URLs estáveis (`/termos/v1.0`, `/privacidade/v1.0`). Uma versão nova vira um arquivo novo, e o antigo nunca é editado.
   - Cada aceite grava a versão, a data e hora e o hash SHA-256 do texto aceito, numa lista só de acréscimos.
   - Quando a versão vigente muda, quem aceitou uma anterior aceita de novo antes de comprar.
   - O texto v1.0 sai em rascunho, para o usuário revisar.
9. **Elegibilidade no servidor:** `POST /api/checkout` recebe `{ eventId, utm }`. O servidor confere:
   - token válido;
   - lead existente com status `COMPLETE`;
   - aceite da versão vigente;
   - evento configurado e ainda não realizado.

   Se tudo estiver certo, grava a intenção `REDIRECTED` e devolve a URL de compra que está na configuração. O front só navega para a URL que a API devolveu. Se faltar algo, a resposta é 4xx com um motivo (`PROFILE_INCOMPLETE`, `TERMS_OUTDATED` etc.).
10. **Origem (UTM):**
    - A landing lê `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` na chegada e os guarda em `sessionStorage`, para não perder durante o login Google.
    - Os valores são enviados no checkout. O servidor limpa: tamanho máximo e só caracteres seguros.
    - Sem UTM, `source = "direct"`.
    - O lead também guarda a primeira origem (`firstTouch`).
11. **Compra confirmada:** estrutura separada (`Purchase`), gravada **só** pela importação de um relatório (fase 2). Nunca a partir de clique, retorno do navegador ou intenção.

## Dados (DynamoDB, tabela única, `pk`/`sk`, TTL `expiresAt`)

| Item | pk | sk | Campos |
| --- | --- | --- | --- |
| Lead | `store#goodgame#lead#<leadId>` | `lead` | leadId (UUID), storeId, googleSub, cognitoSub, fullName, email, phone, birthDate (AAAA-MM-DD), status (`INCOMPLETE`/`COMPLETE`), marketingOptIn, firstTouch {source, medium, campaign, content, at}, createdAt, updatedAt, version, expiresAt |
| Trava Google | `store#goodgame#google#<googleSub>` | `lock` | leadId |
| Consentimento | `store#goodgame#lead#<leadId>` | `consent#<iso>#<tipo>` | tipo (`terms`, `privacy`, `marketing`), versão, hash, valor (aceito/revogado), at |
| Intenção | `store#goodgame#lead#<leadId>` | `intent#<iso>#<intentId>` | intentId, leadId, eventId, at, source/medium/campaign/content, status `REDIRECTED` |
| Compra (fase 2) | `store#goodgame#purchase#<purchaseId>` | `purchase` | purchaseId, leadId (ou null se não cruzou), eventId, ticketType, purchasedAt, amountPaid, transactionId?, confirmationSource (`ligamagic-report`), importId |

A criação do lead e da trava é feita numa transação condicional, o que impede duplicidade mesmo com dois cliques ao mesmo tempo. A página do ADM (fase 2) pode fazer Scan, porque o volume é de centenas de itens.

## API (handler da landing, atrás de `/api/*` na mesma distribuição, sem CORS)

- `GET /api/events`: público, eventos vigentes da configuração (sem o link).
- `GET /api/me`: lead do token, ou cria o lead `INCOMPLETE` com nome e e-mail do Google. Devolve o status e o que falta.
- `PUT /api/me`: cadastro ou atualização (telefone, nascimento, nome, aceites, marketing).
- `POST /api/checkout`: elegibilidade, grava a intenção e devolve `{ url }`.
- Fase 2: `GET /api/admin/report` (grupo `admin` do Cognito), `POST /api/admin/import` e `GET /api/admin/export.csv`.

## Fluxo

Chegada com UTM → landing com os 2 eventos → "Comprar ingresso" em um deles. Se não houver login, vai ao Google e volta. Em seguida `GET /me`: se estiver incompleto ou com termos desatualizados, abre a tela de cadastro. Com tudo certo, `POST /checkout` e redirecionamento para a LigaMagic.

## Fases

- **Fase 1 (hoje):** tudo acima, menos os endpoints de ADM, a importação e a compra. Inclui testes da Etapa 8 da spec (itens 1–14, com o 14 garantindo que nenhuma `Purchase` nasce de checkout) e documentação (fluxos, dados, variáveis, como testar, como trocar o link e o endereço).
- **Fase 2 (até o fim do evento, 22/11):**
  - Página do ADM com cliques, cadastros, intenções por origem e evento, e vendas cruzadas, mais o CSV.
  - Importação do relatório da LigaMagic. O exemplo atual tem **só nomes, um por linha**: o cruzamento normaliza (minúsculas, sem acento, espaços) e propõe pares, e o ADM confirma.
  - Se a LigaMagic tiver um relatório de pedidos com e-mail, telefone e valor, o cruzamento passa a usar esses dados (pendente com o usuário).

## Decisões do construtor (revisão)

- **Sem stack gêmea de teste na fase 1.** A landing só aceita login Google, e o pool de teste não tem Google. Os testes rodam com verificador de token e repositório falsos (Vitest), e o teste real é feito em produção pelo usuário. A stack `tom-test-gg-*` fica para depois. A stack de produção importa o pool `ggtcg-login` pelo `UserPool` que o `build-app` já tem.
- **Fim da venda pela landing:** no início de cada torneio (11:00, `America/Sao_Paulo`). Depois disso, o botão mostra "inscrições encerradas" e o `POST /checkout` responde `EVENT_CLOSED`. O horário fica na configuração (`salesCloseAt`), para mudar sem alterar código.
- **Controlador dos dados (Termos e Política v1.0):** GOOD GAME TCG LTDA, CNPJ 54.733.547/0001-25, Estrada do Mendanha, 646, Loja B, Campo Grande, Rio de Janeiro/RJ, CEP 23087-285. Contato para pedidos sobre os dados: `gg.goodgame.tcg@gmail.com`. O sistema aparece como operador, sem nome próprio na v1.0.
- **ADM por loja:** grupo `goodgame-admin` no pool. O grupo `admin` do TOM **não** vê os leads (isolamento por loja e LGPD).

## Deixado para o construtor

Nomes de pastas e arquivos dentro de `apps/landing` e da API. Layout fiel às artes. Mensagens de erro. Como reaproveitar `google.ts` e `cognito.ts` do web, copiando ou extraindo para um pacote comum se o custo for baixo hoje. Política de cabeçalhos de segurança, copiada do `web-stack`.

## Pendências com o usuário

- O formato do relatório de pedidos da LigaMagic (fase 2).
- A revisão do texto dos Termos e da Política v1.0, antes de publicar.
- O acesso à Cloudflare para `evento.ggtcg.com.br` (depois).
