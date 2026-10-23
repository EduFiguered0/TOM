# TOM Pokémon

Camada de auditoria de resultados para torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager). Os jogadores reportam pelo celular, o sistema valida por consenso e só libera a próxima rodada com todas as mesas verdes. O TOM continua sendo a fonte oficial: o sistema só lê os HTMLs que ele gera.

Detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md); arquitetura em [`docs/adr/0001-arquitetura-do-repositorio.md`](docs/adr/0001-arquitetura-do-repositorio.md).

## Estrutura

```
apps/
  uploader/      enviador: observa a pasta do TOM (somente leitura)
packages/
  core/          domínio e casos de uso, sem dependências
  tom-reports/   leitura dos HTMLs do TOM (camada anticorrupção)
  aws-adapters/  DynamoDB e S3 implementando as portas do core
infra/           AWS CDK: tabela de eventos (DynamoDB) e fotografias (S3)
docs/            spec, ADRs e PDFs de referência
tools/           material local fora do git (instalador do TOM)
```

Regra de dependência: `apps → adaptadores → core`. O `core` não importa nada; o ESLint bloqueia violações.

## Requisitos

- Node.js 22 ou mais novo (via nvm-windows: `nvm install 22` e `nvm use 22`)

## Comandos

```bash
npm install
npm run check     # typecheck + lint + testes
npm test          # só testes (offline)
npm run test:aws  # contrato dos adaptadores contra a stack TomTest (precisa de `aws login --profile tom`)
npm run build     # compila os pacotes para dist/
```

Enviador (até a fase 10 só detecta e registra no console; nada sai da máquina):

```bash
npm run uploader -- --folder "C:\Users\<você>\TOM_DATA\data\reports"
```

Infraestrutura (região us-east-2, perfil `tom`; `TomData` é produção, `TomTest` é descartável e usada nos testes reais):

```bash
npm run cdk -- diff --profile tom
npm run cdk -- deploy TomData TomTest --profile tom
```

O bootstrap usa a policy restrita `TomCdkExecution` (`infra/bootstrap/execution-policy.json`) em vez de `AdministratorAccess`:

```bash
aws iam create-policy --profile tom --policy-name TomCdkExecution --policy-document file://infra/bootstrap/execution-policy.json
npm run cdk -- bootstrap aws://<conta>/us-east-2 --profile tom --cloudformation-execution-policies arn:aws:iam::<conta>:policy/TomCdkExecution
```

Opções do enviador: `--state` (registro de envios, padrão `~/.tom-uploader/sent.json`, nunca dentro da pasta do TOM), `--interval` e `--quiet` em ms.

## Status

| Fase | Entrega | Status |
| --- | --- | --- |
| 0 | Repositório, TypeScript, lint, testes | ✅ |
| 1 | Parser dos HTMLs do TOM | ✅ |
| 2 | Regras de resultado e termômetro | ✅ |
| 3 | Modelo de eventos e recálculo do estado | ✅ |
| 4 | Enviador (observa a pasta do TOM) | ✅ |
| 5 | Infraestrutura AWS, EventStore no DynamoDB, fotografias no S3 | ✅ |
| 6 | Login, papéis e sessão | |
| 7–9 | Telas: celular, TV e painel | |
| 10 | Upload do enviador para a API | |
