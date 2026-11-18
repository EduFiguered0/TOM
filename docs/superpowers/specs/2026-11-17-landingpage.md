# Implementação da Landing Page GoodGame — Plano de Execução

## Instrução principal

Analise o projeto existente e implemente a funcionalidade de landing page da GoodGame seguindo integralmente a arquitetura, identidade visual, stack, convenções, padrões de código e estrutura já existentes no repositório.

**Não proponha uma nova stack, não substitua tecnologias existentes e não faça alterações desnecessárias na arquitetura ou identidade visual.**

O objetivo é implementar o fluxo funcional descrito nesta especificação, aproveitando ao máximo os recursos existentes.

## Etapa 1 — Análise obrigatória

Antes de implementar:

1. Analise a estrutura do projeto.
2. Identifique os módulos, componentes, serviços, rotas e modelos existentes.
3. Identifique como a autenticação funciona atualmente.
4. Identifique como os dados são persistidos.
5. Verifique se já existe uma estrutura de usuários ou leads que possa ser reutilizada.
6. Identifique os pontos que precisarão ser criados ou modificados.
7. Verifique os padrões de testes e validação existentes.

Apresente um diagnóstico objetivo contendo:
- Estrutura atual relevante.
- Componentes que poderão ser reutilizados.
- Alterações necessárias.
- Novos componentes ou módulos necessários.
- Dependências externas necessárias.
- Riscos e dúvidas que precisam de decisão.

Não implemente funcionalidades antes de concluir essa análise e apresentar o plano técnico de alterações.

## Etapa 2 — Autenticação e identificação

Implementar autenticação utilizando conta Google.

Requisitos:

- Identificar o usuário por meio do identificador único da conta Google (`sub`).
- Não utilizar o e-mail isoladamente como identificador de identidade.
- Reconhecer usuários previamente cadastrados.
- Não criar registros duplicados.
- Manter a sessão autenticada.
- Validar a autenticação no backend.
- Não expor credenciais ou segredos no frontend.

Caso já exista autenticação no projeto, avaliar como estendê-la antes de introduzir outro mecanismo.

## Etapa 3 — Cadastro complementar

Após a autenticação, verificar se o usuário possui todos os dados obrigatórios.

Campos:

- Nome completo.
- E-mail.
- Telefone com DDD.
- Data de nascimento.
- Aceite obrigatório dos termos e política de privacidade.
- Consentimento opcional para marketing.

Nome e e-mail poderão ser preenchidos a partir dos dados fornecidos pelo Google.

Regras:

- Telefone obrigatório.
- Data de nascimento obrigatória.
- CPF não deve ser solicitado ou armazenado.
- Validar os campos no frontend e backend.
- Registrar data e versão dos termos aceitos.
- Não duplicar usuários existentes.
- Permitir completar ou atualizar os dados cadastrais.

## Etapa 4 — Evento e liberação do link

O MVP contempla somente um evento.

As informações do evento e o endereço externo de compra deverão ser configuráveis, evitando dependência de valores fixos espalhados pelo código.

Fluxo:

1. Usuário acessa a landing page.
2. Clica em comprar ingresso.
3. Sistema verifica a autenticação.
4. Se não estiver autenticado, solicita login Google.
5. Após autenticação, verifica os dados cadastrais.
6. Se houver dados obrigatórios ausentes, solicita complementação.
7. Se estiver tudo válido, libera o acesso ao checkout externo.
8. Registra a intenção de compra.
9. Redireciona para a LigaMagic.

A proteção não pode depender exclusivamente de controles visuais no frontend. O backend deverá validar a elegibilidade antes de liberar o redirecionamento.

## Etapa 5 — Leads

Criar ou adaptar a estrutura de leads existente.

Cada lead deverá ter uma identificação própria e persistente.

Armazenar:

- Identificador interno.
- Identificador Google.
- Nome completo.
- E-mail.
- Telefone.
- Data de nascimento.
- Data de criação.
- Data de atualização.
- Status cadastral.
- Histórico de aceite dos termos e consentimentos.

Associar o lead ao evento sem criar um novo lead para cada evento.

Antes de criar novas tabelas ou coleções, verificar se a estrutura atual já atende a esses requisitos.

## Etapa 6 — Intenção de compra

Criar uma estrutura independente para registrar intenções de compra.

Campos mínimos:

- ID.
- Lead ID.
- Event ID.
- Data e horário do redirecionamento.
- Origem.
- Status.

Status inicial: `REDIRECTED`.

Importante:

O redirecionamento para a LigaMagic não representa uma venda confirmada.

Não criar registros de compra confirmada a partir de cliques, redirecionamentos ou retornos do navegador.

## Etapa 7 — Preparação para confirmação de vendas

A LigaMagic ainda não possui uma integração oficial de vendas confirmada neste escopo.

Portanto:

- Não presumir existência de webhook.
- Não inventar endpoints.
- Não implementar scraping.
- Não automatizar acesso a painéis de terceiros.
- Não considerar intenções como vendas.

Manter a possibilidade de futura integração oficial ou importação de relatórios de vendas.

A estrutura de compra confirmada deverá ser separada da estrutura de intenção de compra.

Uma compra somente poderá ser registrada após confirmação por uma fonte confiável.

Os dados previstos para uma compra são:

- ID da compra.
- Lead ID.
- Event ID.
- Tipo de ingresso.
- Data da compra.
- Valor efetivamente pago.
- ID da transação, se disponível.
- Origem da confirmação.

A importação de vendas não deve bloquear a entrega do MVP.

## Etapa 8 — Testes

Criar ou atualizar testes seguindo os padrões existentes.

Cobrir pelo menos:

1. Autenticação bem-sucedida.
2. Falha de autenticação.
3. Identificação de usuário existente.
4. Cadastro de novo usuário.
5. Validação de telefone obrigatório.
6. Validação de data de nascimento obrigatória.
7. Ausência de solicitação de CPF.
8. Aceite obrigatório dos termos.
9. Bloqueio de usuário com cadastro incompleto.
10. Liberação do link para usuário elegível.
11. Registro da intenção de compra.
12. Associação correta entre lead e evento.
13. Prevenção de leads duplicados.
14. Garantia de que intenção não gera venda confirmada.

## Etapa 9 — Documentação

Documentar:

- Fluxo de autenticação.
- Fluxo de cadastro.
- Regras de liberação do checkout.
- Estrutura dos dados.
- Fluxo de registro de intenção de compra.
- Configuração do endereço da LigaMagic.
- Variáveis de ambiente necessárias.
- Como executar os testes.

## Regras de execução

- Respeitar a arquitetura existente.
- Reutilizar componentes e serviços sempre que possível.
- Evitar duplicação de código.
- Aplicar os padrões de qualidade já adotados no projeto.
- Implementar validações no backend.
- Tratar erros de forma consistente.
- Não adicionar dependências sem justificativa.
- Não remover funcionalidades existentes.
- Não executar alterações destrutivas no banco.
- Não realizar deploy ou alterações em ambientes de produção sem autorização.

## Entrega esperada

Ao final, apresentar:

1. Resumo das funcionalidades implementadas.
2. Arquivos criados e modificados.
3. Alterações no banco de dados.
4. Testes implementados e resultados.
5. Configurações necessárias.
6. Pendências e limitações.
7. Instruções para validar o fluxo completo.

**Importante:** trabalhe em etapas. Primeiro apresente o diagnóstico e o plano técnico. Após aprovação, implemente cada fase e valide os resultados antes de avançar.