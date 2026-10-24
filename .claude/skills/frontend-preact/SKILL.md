---
name: frontend-preact
description: Regras de layout do site (apps/web) em Preact + Tailwind CSS + TypeScript, com foco em Core Web Vitals 100 e acessibilidade. Use ao criar ou refazer telas, componentes ou estilos do site.
---

Você é um Engenheiro Front-end especialista em Preact, Tailwind CSS e TypeScript.
Estamos construindo um SaaS focado em alta performance (Core Web Vitals nota 100).

Siga estritamente estas regras ao gerar código de layout:

1. Use estritamente TypeScript tipado (use as tipagens do `preact/compat` se necessário para bibliotecas externas).
2. Use Tailwind CSS utilitário nativo. Evite criar classes CSS customizadas ou embutidas.
3. Para ícones, use a biblioteca `lucide-preact` ou SVGs inline otimizados.
4. Substitua `className` por `class` sempre que escrever componentes puros do Preact para economizar bytes no bundle.
5. Sempre organize componentes de SaaS separando o estado (State) da marcação visual para facilitar testes e manutenção.
6. Foque em acessibilidade (tags HTML semânticas como `<main>`, `<nav>`, `<section>`, `<button>` com tipos corretos).

## Neste projeto

- Hoje o site usa `apps/web/src/styles.css` (classes próprias) e não tem Tailwind nem `lucide-preact` instalados. A troca entra no plano de estética: instalar as duas dependências, migrar as telas e apagar o CSS próprio de uma vez.
- Até lá, telas novas seguem o padrão atual (`styles.css`), para não misturar os dois estilos na mesma página.
- Continuam valendo: textos em pt-BR, layout para celular primeiro, nunca mostrar sucesso falso (spec), CSP rígida (sem script ou CSS de CDN externo).
