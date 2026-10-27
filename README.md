# TOM Pokémon

Sistema de apoio a torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager), feito para a loja Good Gamë.

## Por que existe

No TOM, os resultados de cada mesa são digitados pelo organizador a partir de papéis preenchidos pelos jogadores, o que gera filas, erros de digitação e discussões sobre placar. Este projeto põe uma camada de auditoria em volta do TOM, sem substituí-lo:

- Os jogadores se inscrevem pelo QR mostrado na TV do salão e reportam o resultado da própria mesa pelo celular.
- O sistema valida por consenso: cada mesa tem uma cor (aguardando, um lado reportou, resultado validado, juiz na mesa).
- A TV mostra as mesas, o cronômetro da rodada, os vencedores e a classificação.
- O organizador e os juízes resolvem divergências num painel e lançam as keys no TOM.

O TOM continua sendo a fonte oficial: o sistema só lê os relatórios HTML que ele gera.

## Arquitetura

Monorepo TypeScript em arquitetura hexagonal (portas e adaptadores):

```
apps/
  api/           API HTTP
  web/           site: celular do jogador, TV do salão e área do organizador
  uploader/      enviador alternativo dos relatórios do TOM
packages/
  core/          domínio e casos de uso, sem dependências externas
  contracts/     formato e validação das mensagens entre site e API
  tom-reports/   leitura dos relatórios do TOM (camada anticorrupção)
  aws-adapters/  persistência implementando as portas do core
infra/           infraestrutura como código
```

- **Regra de dependência:** `apps → adaptadores / contracts → core`. O `core` não importa nada de fora; o lint bloqueia violações.
- **Rodadas em event sourcing:** cada reporte, ajuste e acréscimo é um evento gravado; o estado da mesa é a projeção deles, o que deixa a auditoria completa.
- **Nuvem serverless:** paga só pelo uso, com custo projetado de centavos por mês para o porte de uma loja.

Decisões de arquitetura em [`docs/adr`](docs/adr) e detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md).

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (Node.js 22) |
| Site | Preact, Tailwind CSS, Vite |
| API | AWS Lambda com Function URL |
| Dados | Amazon DynamoDB e Amazon S3 |
| Login | Amazon Cognito (e-mail e senha, Google) |
| Entrega do site | Amazon CloudFront |
| Infraestrutura | AWS CDK com cdk-nag |
| Testes e qualidade | Vitest, ESLint, GitHub Actions |
| Versões | Versionamento semântico com release-please |
