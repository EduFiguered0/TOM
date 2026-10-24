# TOM Pokémon

Camada de auditoria de resultados para torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager). Os jogadores reportam pelo celular, o sistema valida por consenso e só libera a próxima rodada com todas as mesas verdes. O TOM continua sendo a fonte oficial: o sistema só lê os HTMLs que ele gera.

Detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md); arquitetura em [`docs/adr/0001-arquitetura-do-repositorio.md`](docs/adr/0001-arquitetura-do-repositorio.md).

## Estrutura

```
apps/
  api/           API: uma Lambda atrás de Function URL (rotas abaixo)
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

Enviador (até a fase 10 só detecta e registra no console; nada sai da máquina):

```bash
npm run uploader -- --folder "C:\Users\<você>\TOM_DATA\data\reports"
```

Opções: `--state` (registro de envios, padrão `~/.tom-uploader/sent.json`, nunca dentro da pasta do TOM), `--interval` e `--quiet` em ms.

## AWS

Região us-east-2, perfil `tom`. Cada stack de produção tem um gêmeo descartável usado só nos testes reais:

| Stack | Gêmeo de teste | Recursos |
| --- | --- | --- |
| `TomData` | `TomTest` | DynamoDB `Events` e `Accounts` (sob demanda, TTL 24 meses), S3 `Snapshots` (privado, expira em 24 meses) |
| `TomAuth` | `TomAuthTest` | Cognito user pool (Essentials, código por e-mail), grupos `admin` e `judge` |
| `TomApi` | `TomApiTest` | Lambda Node 22 Arm 256 MB + Function URL (sem API Gateway), logs por 14 dias |

Custo projetado: **menos de US$ 0,20/mês** com 100 jogadores e 1 evento por mês. Preços, franquias e escolhas feitas por custo estão em [Recursos AWS e custos](docs/spec-tom.md#recursos-aws-e-custos-r3).

```bash
npm run cdk -- diff --profile tom
npm run cdk -- deploy --all --profile tom   # num terminal interativo: mudanças de IAM pedem confirmação
```

Rotas da API (todas exigem `Authorization: Bearer <token de acesso do Cognito>`):

| Rota | Quem | Para quê |
| --- | --- | --- |
| `GET /me` | qualquer conta | Dados da própria conta, papel e se já pode agir (404 se ainda não cadastrou) |
| `POST /me` | qualquer conta | Cadastro (perfil LGPD e Player ID informado); o e-mail vem do Cognito |
| `POST /session` | qualquer conta | Ativa este dispositivo; com outro ativo, exige `{"replace": true}` e revoga o anterior |
| `GET /accounts/{id}` | ADM | Consulta a conta do jogador no check-in |
| `POST /accounts/{id}/player-id` | ADM | Confirma (ou corrige) o Player ID no check-in |

Papéis vêm dos grupos do Cognito. Para dar o papel de ADM (ou `judge`) a uma conta já criada; vale no próximo token, em até 15 min:

```bash
aws cognito-idp admin-add-user-to-group --profile tom --user-pool-id <TomAuth.UserPoolId> --username <e-mail> --group-name admin
```

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
| 6 | Login, papéis e sessão (6.1 domínio + Cognito ✅, 6.2 API ✅, 6.3 check-in do ADM ✅, Google) | ⏳ |
| 7–9 | Telas: celular, TV e painel | |
| 10 | Upload do enviador para a API | |
