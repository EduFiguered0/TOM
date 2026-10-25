# Redesenho das telas (ADM, celular, TV)

Aprovado em 2026-10-25. Esboços aprovados: `layout-v2` (painel) e `inicio-v1` (início do ADM), em tema escuro.

## Por quê

O site hoje é uma coluna de cartões empilhados. No evento, o ADM usa o painel num notebook, com o TOM em segundo plano, e precisa rolar para achar as coisas. A meta é **ver tudo numa tela, sem rolar**, com cara de CRM.

## Metas

- **ADM (notebook, a partir de 1280×720):** nenhuma rolagem da página nas abas Evento e Rodada. Listas longas (inscritos, mesas) rolam dentro do próprio bloco.
- Tema escuro (paleta atual de `styles.css`: fundo `#0f141b`, painel `#161d27`, destaque `#7aa2ff`, verde, laranja, vermelho e cinza do termômetro).
- O celular do jogador e a TV recebem o mesmo visual depois do ADM, cada um num PR.

## Fora do escopo

- Nenhuma regra nova de negócio, rota da API ou contrato. Só a apresentação muda.
- Tema claro (o usuário viu e preferiu o escuro).
- Domínio próprio, e-mails e histórico do jogador (plano 5).

## O que não pode acontecer

- Mostrar sucesso falso (regra da spec). Toda ação mostra o erro real da API.
- Perder alguma função que existe hoje (lista no fim).
- Quebrar a CSP: o CSS sai do build (`style-src 'self'`), nada de CDN.

## Layout do ADM (aprovado)

**Casca, igual em todas as abas**
- Menu lateral fixo (~210 px): Good Gamë, depois **Evento**, **Rodada** (selo com o número da rodada atual), **Inscritos** (quantidade), **Equipe**, **Jogadores**. No rodapé: nome, papel, e-mail e "Sair deste dispositivo".
- Topo fixo: nome e data do evento, à direita o status da pasta do TOM (ponto verde, laranja ou vermelho e "último envio hh:mm (tipo)"), **Abrir TV ↗** (abre `/tv` em outra aba) e o botão principal do momento (ex.: "Ir para a rodada").
- O juiz vê a mesma casca só com a aba Rodada.

**Aba Evento** (início do ADM, substitui `/conta` para o ADM)
- Faixa de etapas: Evento criado → Inscrições (QR) → Confirmação → Rodadas → Resultado final. A etapa atual fica destacada; o botão de avançar (pedir confirmação, encerrar) fica nela.
- Três blocos lado a lado: **Configuração** (nome, data, tempo de rodada, Salvar, Encerrar ou cancelar evento) · **Pasta do TOM** (status, Conectar ou Trocar pasta) e **Juízes escalados** · **Inscritos** em tabela (Player ID, nome, presença, "no TOM", copiar ID e nome, remover) com "Inscrever à mão" embaixo.
- Sem evento ativo: só o formulário "Criar evento".

**Aba Rodada** (substitui `/painel`)
- Linha de cima: abas R1, R2, R3…, contagem por cor, aviso de keys pendentes com link para a rodada, relógio, e o formulário "Iniciar rodada" (formato e minutos) em linha quando a rodada não começou.
- Duas colunas: a **tabela de mesas** (mesa, jogador 1, jogador 2, situação com o ponto de cor, key) e o **detalhe da mesa escolhida** (reportes dos dois, Ajustar resultado com motivo, Key lançada, +min, Reportar por jogador). A primeira mesa que pede ação já vem escolhida.

**Abas Inscritos, Equipe e Jogadores**
- Inscritos: a mesma tabela da aba Evento, em tela cheia.
- Equipe: busca de conta e lista de juízes em tabela.
- Jogadores: "Desfazer vínculo de Player ID" (por minha conta: é o "revogar" que o usuário citou; ele não confirmou).

## Celular e TV (depois do ADM)

- Celular: mesmo tema e componentes, uma coluna, o que importa primeiro (mesa e reporte, depois o evento do dia, depois a conta).
- TV: mantém o layout atual, só ajusta a tipografia e as cores ao novo tema.

## Como será feito (decisões minhas)

- **Tailwind CSS v4** (`@tailwindcss/vite`) e **lucide-preact** para ícones, como manda a skill `frontend-preact`. O CSS próprio (`styles.css`, `panel.css`, `tv.css`) sai. Para não misturar estilos na mesma página, a troca para Tailwind acontece num passo só, logo no primeiro PR, com as telas atuais convertidas sem mudar o layout. Depois vêm os layouts novos.
- Estado separado da marcação: hooks com a carga e o polling (`useEvent`, `usePanel`…) e componentes só visuais.
- Rotas: `/conta` (ADM) passa a abrir a aba Evento; `/painel` vira a aba Rodada; `/conta/inscritos`, `/conta/equipe` e `/conta/jogadores` são as outras. `/tv`, `/e/<código>` e a área do jogador ficam como estão.
- Ordem dos PRs: 1) Tailwind com as telas atuais · 2) casca e aba Evento · 3) aba Rodada · 4) Inscritos, Equipe e Jogadores · 5) celular · 6) TV.

## Funções que não podem sumir (inventário de hoje)

Criar, salvar, cancelar e encerrar evento · pedir confirmação · Abrir TV · pasta do TOM (conectar, permitir, trocar, status) · inscritos (confirmar, lançado no TOM, copiar ID e nome, remover, inscrever à mão) · equipe (buscar, marcar juiz) · escala de juízes · desfazer vínculo · iniciar rodada · termômetro, override, acréscimo, key lançada, reporte por jogador · abas de rodadas e keys pendentes · sair do dispositivo · telas do jogador (Player ID, evento do dia, confirmar presença, mesa e reporte).
