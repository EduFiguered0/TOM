# TOM Pokémon

Camada de auditoria de resultados para torneios de Pokémon TCG rodados no TOM (Tournament Operations Manager). Os jogadores reportam pelo celular, o sistema valida por consenso e só libera a próxima rodada com todas as mesas verdes. O TOM continua sendo a fonte oficial: o sistema só lê os HTMLs que ele gera.

Detalhes do produto em [`docs/spec-tom.md`](docs/spec-tom.md); arquitetura em [`docs/adr/0001-arquitetura-do-repositorio.md`](docs/adr/0001-arquitetura-do-repositorio.md).

## Estrutura

```
packages/
  core/          domínio e casos de uso, sem dependências
  tom-reports/   leitura dos HTMLs do TOM (camada anticorrupção)
docs/            spec, ADRs e PDFs de referência
tools/           material local fora do git (instalador do TOM)
```

Regra de dependência: `apps → adaptadores → core`. O `core` não importa nada; o ESLint bloqueia violações.

## Requisitos

- Node.js 20.18 ou mais novo

## Comandos

```bash
npm install
npm run check     # typecheck + lint + testes
npm test          # só testes
npm run build     # compila os pacotes para dist/
```

## Status

| Fase | Entrega | Status |
| --- | --- | --- |
| 0 | Repositório, TypeScript, lint, testes | ✅ |
| 1 | Parser dos HTMLs do TOM | ✅ |
| 2 | Regras de resultado e termômetro | ✅ |
| 3 | Modelo de eventos e recálculo do estado | ✅ |
| 4 | Enviador (observa a pasta do TOM) | ⏳ |
| 5 | Infraestrutura AWS | |
| 6 | Login, papéis e sessão | |
| 7–9 | Telas: celular, TV e painel | |
| 10 | Upload do enviador para a API | |
