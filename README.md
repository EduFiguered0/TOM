# TOM Pokémon

Camada de auditoria de resultados para torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager). Os jogadores se inscrevem pelo QR da TV e reportam pelo celular; o sistema valida por consenso (termômetro por mesa) e o ADM lança as keys no TOM. O TOM continua sendo a fonte oficial: o sistema só lê os HTMLs que ele gera.

Detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md); arquitetura em [`docs/adr/0001-arquitetura-do-repositorio.md`](docs/adr/0001-arquitetura-do-repositorio.md).

## Estrutura

```
apps/
  api/           API: uma Lambda atrás de Function URL (rotas abaixo)
  web/           site em Preact + Tailwind (tema escuro): home pública (/), privacidade (/privacidade),
                 celular do jogador (/conta), QR do evento (/e/<código>, inscreve sozinho), TV do salão (/tv)
                 e área do ADM no notebook (/conta, /painel, /conta/inscritos, /conta/equipe, /conta/jogadores)
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

## Uso no dia do evento

Área do ADM no notebook do TOM, no **Chrome ou no Edge** (pensada para 1280×720 ou mais, sem rolar a página). Menu lateral com as abas **Evento**, **Rodada**, **Inscritos**, **Equipe** e **Jogadores**; no topo, o status da pasta do TOM e **Abrir TV**.

1. **Evento:** crie o evento (nome, data, tempo de rodada, juízes) e clique em **"Conectar pasta do TOM"** (a pasta `reports` do TOM). A TV mostra o QR; quem escaneia se cadastra e fica inscrito.
2. O ADM digita os inscritos no TOM (tabela com "copiar ID/nome" e "lançado no TOM"). O QR fica aberto até o encerramento, num canto da TV durante as rodadas: quem escaneia depois do início da rodada 1 fica **aguardando o organizador**, e o ADM **aprova** (lança no TOM e a pessoa entra no próximo pareamento) ou **recusa** na tabela de inscritos.
3. **Rodada:** imprima o pareamento e as guias no TOM; a pasta envia sozinha e aparece **"Iniciar rodada"**. As mesas ficam numa tabela por ordem de ação; a mesa escolhida abre ao lado com os reportes, a key do TOM, **Ajustar resultado** (botões por vencedor e placar, ID, DGL, ausência, com motivo), acréscimo e reporte por jogador sem celular. As abas R1, R2… mostram e ajustam rodadas anteriores; keys pendentes só geram aviso, não travam a próxima rodada.
4. Os standings da última rodada do TOM mostram na TV a classificação final (pontos e desempates) e, no celular, a colocação de cada jogador. Aí o ADM encerra o evento.

**Pasta do TOM.** O site lê a pasta (só leitura) a cada 3 s e envia sozinho os relatórios novos para o evento ativo, com o login do ADM: sem token e sem comando. Continua enviando em qualquer aba; num dia novo, o navegador pede um clique em "Permitir". A página precisa ficar aberta (pode ficar atrás do TOM). Arquivos gravados antes da criação do evento (o torneio anterior que ficou na pasta) são ignorados: o primeiro arquivo novo amarra o torneio ao evento.

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
| `POST /me` | qualquer conta | Cadastro (nome, sobrenome, ano de nascimento, telefone opcional e Player ID); o e-mail vem do Cognito. Player ID já em uso: 409 |
| `POST /me/name` | qualquer conta | Confere ou corrige nome e sobrenome (contas antigas tiveram o nome separado no primeiro espaço) |
| `POST /session` | qualquer conta | Ativa este dispositivo; com outro ativo, exige `{"replace": true}` e revoga o anterior |
| `POST /me/player-id` | qualquer conta | Conta sem Player ID informa depois; para trocar, só o ADM (409) |
| `GET /player-ids/{pid}` | ADM | Quem cadastrou esse Player ID |
| `POST /player-ids/{pid}/unlink` | ADM | Desfaz o vínculo errado; o dono verdadeiro pode cadastrar o Player ID |
| `POST /staff/search` | ADM | Equipe: busca conta por nome (sem acento) ou Player ID exato |
| `GET /staff/judges` | ADM | Juízes da equipe |
| `POST /staff/accounts/{id}/judge` | ADM | Marca ou tira o juiz da equipe (`{"judge": true}`); o juiz precisa de Player ID |
| `GET /round/me` | qualquer conta | Rodada atual do ponto de vista do jogador: mesa, oponente, prazo, cor e o próprio reporte (sem o placar do oponente) |
| `POST /round/report` | jogador com Player ID | Reporta placar ou ID na própria mesa |
| `POST /round/start` | ADM | Inicia a rodada publicada pelo TOM (melhor de 1 ou 3, tempo); a rodada 1 põe o evento em andamento |
| `GET /panel` | juiz escalado no evento atual, ADM | Painel: todas as mesas com Player IDs, os dois reportes, cor e motivo, override, acréscimo e a key do TOM; a rodada mais recente e as keys pendentes de rodadas anteriores |
| `GET /panel/rounds/{r}` | juiz, ADM | O mesmo painel para uma rodada anterior do torneio atual |
| `POST /panel/tables/{n}/override` | juiz, ADM | Override (placar, ID, DGL, vitória por ausência) com motivo; avisa se a key já foi lançada |
| `POST /panel/tables/{n}/extend` | juiz, ADM | Acréscimo de tempo na mesa |
| `POST /panel/tables/{n}/key-launched` | ADM | Marca a key como lançada no TOM (só mesa verde) |
| `POST /panel/tables/{n}/report` | ADM | Reporte em nome de jogador sem celular |
| `POST /panel/rounds/{r}/tables/{n}/…` | juiz, ADM | As mesmas ações numa rodada anterior |
| `POST /events` | ADM | Cria o evento do dia (nome, `date`, `roundMinutes` = 30, `judges`); um ativo por vez; devolve o token do enviador uma única vez |
| `GET /events/active` | ADM | Evento ativo, com o código do QR |
| `PATCH /events/{id}` | ADM | Muda o tempo de rodada e os juízes enquanto o evento não acabou |
| `POST /events/{id}/close` | ADM | Encerra (só depois do resultado final do TOM) |
| `POST /events/{id}/cancel` | ADM | Cancela antes de encerrar; não entra no histórico |
| `GET /events/{id}/registrations` | ADM | Inscritos (Player ID, nome, sobrenome, ano) com os contadores de inscritos, entradas tardias aguardando e lançados no TOM |
| `POST /events/{id}/registrations` | ADM | Inscreve à mão (`{"accountId"}`), sem esperar aprovação |
| `POST /events/{id}/registrations/{conta}/approve`, `/remove`, `/launched` | ADM | Aprovar entrada tardia, remover (ou recusar), marcar lançado no TOM |
| `POST /join/{código}` | qualquer conta | Fim do caminho do QR: inscreve (de novo, só devolve a inscrição) |
| `GET /me/event` | qualquer conta | Evento ativo, a própria inscrição e, no fim, a própria colocação |
| `PUT /events/{id}/judges` | ADM | Troca os juízes escalados no evento (só juízes da equipe) |
| `POST /events/{id}/revoke` | ADM | Revoga o token do enviador |
| `POST /uploads` | enviador (`x-upload-token`) | Recebe um HTML do TOM; com pareamento e guias da rodada, publica a rodada |
| `POST /events/active/uploads` | ADM | O mesmo envio, pelo navegador do ADM (pasta do TOM conectada), sempre para o evento ativo; arquivo de antes do evento é ignorado |
| `GET /board` | público | TV por fase do evento (espera, QR com inscritos, rodada com o QR no canto, classificação final), só nomes, guardada 5 s no CloudFront |

O ADM vem do grupo `admin` do Cognito; o juiz é marcado pelo ADM na aba "Equipe" e só age no evento em que for escalado (vê só a aba Rodada). Para dar o papel de ADM a uma conta já criada (vale no próximo token, em até 15 min):

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
