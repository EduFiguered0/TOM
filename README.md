# TOM Pokémon

Camada de auditoria de resultados para torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager). Os jogadores reportam pelo celular, o sistema valida por consenso e só libera a próxima rodada com todas as mesas verdes. O TOM continua sendo a fonte oficial: o sistema só lê os HTMLs que ele gera.

Detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md); arquitetura em [`docs/adr/0001-arquitetura-do-repositorio.md`](docs/adr/0001-arquitetura-do-repositorio.md).

## Estrutura

```
apps/
  api/           API: uma Lambda atrás de Function URL (rotas abaixo)
  web/           site em Preact: home pública da loja (/), privacidade (/privacidade), conta do jogador (/conta),
                 QR do evento (/e/<código>, inscreve sozinho), TV do salão (/tv), painel do ADM e do juiz (/painel)
  uploader/      enviador: observa a pasta do TOM (somente leitura)
packages/
  core/          domínio e casos de uso, sem dependências
  contracts/     formato e validação das requisições da API, sem dependências
  tom-reports/   leitura dos HTMLs do TOM (camada anticorrupção)
  aws-adapters/  DynamoDB e S3 implementando as portas do core
infra/           AWS CDK: dados, login e API
docs/            spec, ADRs e PDFs de referência
tools/           material local fora do git (instalador do TOM)
```

Regra de dependência: `apps → adaptadores / contracts → core`. O `core` não importa nada; o ESLint bloqueia violações.

## Requisitos

- Node.js 22 ou mais novo (via nvm-windows: `nvm install 22` e `nvm use 22`)
- Para a AWS: AWS CLI com o perfil `tom` (`aws login --profile tom`)

## Comandos

```bash
npm install
npm run check     # typecheck + lint + testes (offline, sem AWS)
npm test          # só testes (offline)
npm run test:aws  # testes reais contra as stacks de teste (TomTest, TomAuthTest, TomApiTest)
npm run build     # compila os pacotes para dist/
```

Site (desenvolvimento local com o pool e a API de testes; publicação em produção):

```bash
npm run web:dev      # http://localhost:5173 e http://localhost:5173/tv
npm run web:deploy   # build, envio ao S3 e limpeza do cache do CloudFront
```

**Pasta do TOM (caminho principal).** No notebook do TOM, abra o painel do ADM no **Chrome ou no Edge**, crie o evento e clique em **"Conectar pasta do TOM"** no cartão "Evento do dia". O site lê a pasta (só leitura) a cada 3 s e envia sozinho os relatórios novos para o evento ativo, com o login do ADM: sem token e sem comando. Num dia novo, o navegador pede um clique em "Permitir". A página precisa ficar aberta (pode ficar atrás do TOM).

**Plano B: enviador por comando**, no notebook do TOM (somente leitura da pasta). O token é gerado na criação do evento (resposta de `POST /events`); ele vai pela variável de ambiente para não ficar no histórico do terminal:

```powershell
$env:TOM_UPLOAD_TOKEN="<token do evento>"
npm run uploader -- --folder "C:\Users\<você>\TOM_DATA\data\reports" --api https://<site>/api
```

Sem `--api`, o enviador só mostra no console o que enviaria (modo de teste). Token revogado ou de outro torneio param o envio com instrução; sem internet, ele tenta de novo sozinho.

Opções: `--state` (registro de envios, padrão `~/.tom-uploader/sent.json`, nunca dentro da pasta do TOM), `--interval` e `--quiet` em ms.

## AWS

Região us-east-2, perfil `tom`. Cada stack de produção tem um gêmeo descartável usado só nos testes reais:

| Stack | Gêmeo de teste | Recursos |
| --- | --- | --- |
| `TomData` | `TomTest` | DynamoDB `Events`, `Accounts` e `Tournaments` (sob demanda, TTL 24 meses), S3 `Snapshots` (privado, expira em 24 meses) |
| `TomAuth` | `TomAuthTest` | Cognito user pool (Essentials, e-mail e senha; Google só em produção), gatilho de pré-cadastro (Lambda 128 MB), grupo `admin` |
| `TomApi` | `TomApiTest` | Lambda Node 22 Arm 256 MB + Function URL (sem API Gateway), logs por 14 dias |
| `TomWeb` | — | Site no S3 + CloudFront, `/api` no mesmo endereço, `/api/board` guardado 5 s, CSP rígida |

Custo projetado: **menos de US$ 0,20/mês** com 100 jogadores e 1 evento por mês. Preços, franquias e escolhas feitas por custo estão em [Recursos AWS e custos](docs/spec-tom.md#recursos-aws-e-custos-r3).

```bash
npm run cdk -- diff --profile tom
npm run cdk -- deploy --all --profile tom   # num terminal interativo: mudanças de IAM pedem confirmação
```

Rotas da API (as de conta e ADM exigem `Authorization: Bearer <token de acesso do Cognito>`):

| Rota | Quem | Para quê |
| --- | --- | --- |
| `GET /me` | qualquer conta | Dados da própria conta, papel e se já pode agir (404 se ainda não cadastrou) |
| `POST /me` | qualquer conta | Cadastro (perfil LGPD e Player ID); o e-mail vem do Cognito. Player ID já em uso: 409 |
| `POST /session` | qualquer conta | Ativa este dispositivo; com outro ativo, exige `{"replace": true}` e revoga o anterior |
| `POST /me/player-id` | qualquer conta | Conta sem Player ID informa depois; para trocar, só o ADM (409) |
| `GET /player-ids/{pid}` | ADM | Quem cadastrou esse Player ID |
| `POST /player-ids/{pid}/unlink` | ADM | Desfaz o vínculo errado; o dono verdadeiro pode cadastrar o Player ID |
| `POST /staff/search` | ADM | Equipe: busca conta por nome (sem acento) ou Player ID exato |
| `GET /staff/judges` | ADM | Juízes da equipe |
| `POST /staff/accounts/{id}/judge` | ADM | Marca ou tira o juiz da equipe (`{"judge": true}`); o juiz precisa de Player ID |
| `GET /round/me` | qualquer conta | Rodada atual do ponto de vista do jogador: mesa, oponente, prazo, cor e o próprio reporte (sem o placar do oponente) |
| `POST /round/report` | jogador com Player ID | Reporta placar ou ID na própria mesa |
| `POST /round/start` | ADM | Inicia a rodada publicada pelo TOM (melhor de 1 ou 3, tempo) |
| `GET /panel` | juiz escalado no evento atual, ADM | Painel: todas as mesas com Player IDs, os dois reportes, cor e motivo, override, acréscimo e a key do TOM |
| `POST /panel/tables/{n}/override` | juiz, ADM | Override (placar, ID, DGL, vitória por ausência) com motivo; avisa se a key já foi lançada |
| `POST /panel/tables/{n}/extend` | juiz, ADM | Acréscimo de tempo na mesa |
| `POST /panel/tables/{n}/key-launched` | ADM | Marca a key como lançada no TOM (só mesa verde) |
| `POST /panel/tables/{n}/report` | ADM | Reporte em nome de jogador sem celular |
| `POST /events` | ADM | Cria o evento do dia (nome, `date`, `roundMinutes` = 30, `judges`); um ativo por vez; devolve o token do enviador uma única vez |
| `GET /events/active` | ADM | Evento ativo, com o código do QR |
| `PATCH /events/{id}` | ADM | Muda o tempo de rodada e os juízes enquanto o evento não acabou |
| `POST /events/{id}/confirmation` | ADM | "Pedir confirmação": o QR fecha na hora |
| `POST /events/{id}/close` | ADM | Encerra (só depois do resultado final do TOM) |
| `POST /events/{id}/cancel` | ADM | Cancela antes de encerrar; não entra no histórico |
| `GET /events/{id}/registrations` | ADM | Inscritos (Player ID, nome, ano) com os contadores de confirmados e lançados no TOM |
| `POST /events/{id}/registrations` | ADM | Inscreve à mão (`{"accountId"}`); depois da confirmação, já entra confirmado |
| `POST /events/{id}/registrations/{conta}/confirm`, `/remove`, `/launched` | ADM | Confirmar por ele, remover, marcar lançado no TOM |
| `POST /join/{código}` | qualquer conta | Fim do caminho do QR: inscreve (de novo, só devolve a inscrição) |
| `GET /me/event` | qualquer conta | Evento ativo e a própria inscrição |
| `POST /me/event/confirm` | qualquer conta | Confirma a própria presença quando o ADM pede |
| `PUT /events/{id}/judges` | ADM | Troca os juízes escalados no evento (só juízes da equipe) |
| `POST /events/{id}/revoke` | ADM | Revoga o token do enviador |
| `POST /uploads` | enviador (`x-upload-token`) | Recebe um HTML do TOM; com pareamento e guias da rodada, publica a rodada |
| `POST /events/active/uploads` | ADM | O mesmo envio, pelo navegador do ADM (pasta do TOM conectada no painel), sempre para o evento ativo |
| `GET /board` | público | TV por fase do evento (espera, QR com inscritos, confirmação, rodada, classificação final), só nomes, guardada 5 s no CloudFront |

O ADM vem do grupo `admin` do Cognito; o juiz é marcado pelo ADM no cartão "Equipe" do site e só age no evento em que for escalado (até o plano 4, o evento atual é o da rodada publicada pelo TOM). Para dar o papel de ADM a uma conta já criada; vale no próximo token, em até 15 min:

```bash
aws cognito-idp admin-add-user-to-group --profile tom --user-pool-id <TomAuth.UserPoolId> --username <e-mail> --group-name admin
```

### Login

E-mail e senha (mínimo de 8 caracteres, com letras e números). O cadastro é confirmado na hora por um gatilho de pré-cadastro, sem código por e-mail; o único e-mail que o sistema manda é o de "Esqueci minha senha". Contas antigas, criadas com código por e-mail, definem a senha por ele. Só o Google liga um login novo a uma conta que já existe com o mesmo e-mail; numa conta criada com senha (e-mail não provado), o Google prova o dono e os logins de senha caem.

Como a senha não prova o e-mail, ao dar o papel de ADM confira o usuário certo: `aws cognito-idp list-users --profile tom --user-pool-id <TomAuth.UserPoolId> --filter 'email = "<e-mail>"'` lista todos os logins desse e-mail; use o `Username` de quem você conhece.

### Ativar o Google

1. No Google Cloud, cliente OAuth "Aplicativo da Web" com o URI de redirecionamento `https://ggtcg-login.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`. Enquanto o app estiver "Em teste", só os usuários de teste entram; para publicar, o Google pede home e política de privacidade.
2. Cadastrar o provedor no pool (o segredo fica só no seu terminal, nunca no repositório):

   ```bash
   aws cognito-idp create-identity-provider --profile tom --user-pool-id <TomAuth.UserPoolId> --provider-name Google --provider-type Google --provider-details client_id=<id>,client_secret=<segredo>,authorize_scopes="openid email profile" --attribute-mapping email=email,email_verified=email_verified
   ```

3. Trocar `"google": false` para `true` em `infra/cdk.json`, rodar `npm run cdk -- deploy TomAuth --profile tom` e `npm run web:deploy`.

O bootstrap usa a policy restrita `TomCdkExecution` (`infra/bootstrap/execution-policy.json`) em vez de `AdministratorAccess`:

```bash
aws iam create-policy --profile tom --policy-name TomCdkExecution --policy-document file://infra/bootstrap/execution-policy.json
npm run cdk -- bootstrap aws://<conta>/us-east-2 --profile tom --cloudformation-execution-policies arn:aws:iam::<conta>:policy/TomCdkExecution
```

Para mudar a policy: edite o JSON e rode `aws iam create-policy-version --profile tom --policy-arn <arn> --policy-document file://infra/bootstrap/execution-policy.json --set-as-default`.

## Status

| Fase | Entrega | Status |
| --- | --- | --- |
| 0 | Repositório, TypeScript, lint, testes | ✅ |
| 1 | Parser dos HTMLs do TOM | ✅ |
| 2 | Regras de resultado e termômetro | ✅ |
| 3 | Modelo de eventos e recálculo do estado | ✅ |
| 4 | Enviador (observa a pasta do TOM) | ✅ |
| 5 | Infraestrutura AWS, EventStore no DynamoDB, fotografias no S3 | ✅ |
| 6 | Login (e-mail e senha, Google), sessão única, papéis, Player ID que vale no cadastro (SES pendente, ver spec) | ✅ |
| 7 | Celular: site e login, ingestão do TOM e TV ao vivo, rodada e reporte (histórico do jogador fica para outra spec) | ✅ |
| 8–9 | TV do salão e painel do ADM/juiz (estética pendente) | ✅ |
| 10 | Upload do enviador para a API | |
