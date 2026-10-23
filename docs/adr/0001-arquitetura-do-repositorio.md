# ADR 0001 — Arquitetura do repositório

Oct 23, 2026 · Aceita

## Contexto

Monorepo TypeScript com núcleo puro, adaptadores AWS (fase 5+), três telas e um enviador local (ver `docs/spec-tom.md`). O parser do TOM nasceu dentro do domínio e o trazia junto com uma dependência de HTML.

## Decisão

Arquitetura hexagonal (portas e adaptadores) em monorepo npm workspaces:

```
apps/        o que é implantado: api, web (/jogador, /tv, /painel), uploader
packages/
  core/          domínio + casos de uso + portas, por contexto (tournament, results, identity, shared)
  tom-reports/   camada anticorrupção: HTMLs do TOM → modelo do core
  contracts/     DTOs e validação da API (fase 6)
  aws-adapters/  DynamoDB, S3, Cognito implementando as portas do core (fase 5)
infra/       AWS CDK em TypeScript (fase 5)
docs/        spec, adr/, reference/
tools/       material local fora do git (instalador do TOM)
```

Regra de dependência: `apps → adapters / tom-reports / contracts → core → nada`. Garantida por project references do TypeScript e `no-restricted-imports` no ESLint.

Convenções:

- Cada pacote tem `src/` (produção) e `test/` (testes, fixtures, helpers). Testes importam pela API pública (`src/index.ts`).
- Pacotes expõem `src` pela condição `source` em dev e teste, e `dist` no build.
- Pastas só são criadas na fase que as usa.

## Consequências

- O `core` roda no navegador, na Lambda e nos testes sem nuvem nem dependências.
- Mudança de formato do TOM fica contida no `tom-reports`.
- Um único site simplifica deploy e componentes; separar por tela continua possível.
- Custo: mais `package.json`/`tsconfig.json` por pacote.
