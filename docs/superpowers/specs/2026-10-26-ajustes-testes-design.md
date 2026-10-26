# Ajustes dos testes com o solicitante

Conversado em 2026-10-26, depois de um teste do dia do evento com o solicitante. Layout da TV aprovado: `tv-rodada-v3` (tudo numa página, byes à parte).

## Por quê

O teste mostrou atrito no dia do evento: o QR fecha cedo demais para quem chega atrasado, a confirmação de presença não funciona sem notificação no celular, a TV embaralha as mesas e não mostra resultados nem classificação parcial, e o painel pede passos que custam tempo (motivo no ajuste, botão Salvar). A loja também quer controlar quem pagou.

## Metas

- O dia do evento flui sem passos manuais desnecessários para o ADM.
- A TV é a referência do salão: mesas em ordem, vencedor de cada mesa, byes, classificação parcial entre rodadas.
- O TOM continua sendo a fonte da verdade: nome do evento, pareamentos e classificação vêm dele; o sistema não calcula classificação.

## Fora do escopo

- Pagamento online, valor ou forma de pagamento (só "pagou: sim/não").
- Logo por loja (vira tema do SaaS).
- TV para eventos com mais de ~45 mesas: volta a paginar, problema futuro.
- Histórico de partidas do jogador (continua fora; só o registro de pagamento por evento entra).

## O que não pode acontecer

- A TV mostrar classificação que não veio de um arquivo do TOM.
- Mesas mudarem de posição por causa de um reporte, no painel ou na TV.
- O navegador do ADM receber e-mail, telefone ou nome completo de jogadores na guia Jogadores.
- O jogador ver o próprio status de pagamento.
- O QR de juiz aparecer na TV ou valer duas vezes.
- O quadro da TV ou uma foto ser acessível sem sessão de ADM (ou, para a foto no celular, de jogador daquela mesa).
- A foto de um menor sem a autorização de imagem do responsável aparecer em qualquer tela.
- Mostrar sucesso falso (regra geral): toda ação mostra o erro real da API.

## 1. Ciclo do evento e entrada tardia

- **A confirmação de presença sai por inteiro:** estado `confirming`, botão "Pedir confirmação", aviso "Confirme sua presença" no celular, contador de confirmados, "confirmar por ele" e o bloqueio/aviso de pendentes antes da rodada 1. A faixa de etapas da aba Evento perde a etapa Confirmação.
- Estados: **inscrições abertas → em andamento (desde o início da rodada 1) → final (TOM mandou a última classificação) → encerrado**, ou cancelado.
- **O QR nunca fecha** até o encerramento.
- Antes de a rodada 1 começar, escanear o QR inscreve na hora (como hoje).
- Depois de a rodada 1 começar, quem escaneia fica **"aguardando o organizador"** (o celular mostra isso). O painel avisa "N entradas tardias" (aba Evento e contador no menu Inscritos), com Player ID, nome, sobrenome e ano de nascimento prontos para copiar e os botões **Aprovar** / **Recusar**.
  - Aprovado: vira inscrito normal; o ADM lança no TOM e a pessoa entra no próximo pareamento.
  - Recusado: o celular mostra "Procure o organizador"; escanear de novo não reabre o pedido (só o ADM inscreve à mão).
- Continua como hoje: só reporta quem está nas guias do TOM; marcação "lançado no TOM"; inscrever à mão; remover inscrito; juiz escalado não se inscreve.
- Eventos que estiverem em `confirming` no momento da migração passam para inscrições abertas.

## 2. Cadastro: nome, sobrenome e ano de nascimento

- O campo "Nome completo" vira **Nome** e **Sobrenome** (como o TOM pede), mais o ano de nascimento que já existe.
- Contas existentes: o nome é separado no primeiro espaço ("João da Silva" → "João" / "da Silva"). No próximo acesso, a pessoa vê os dois campos preenchidos para conferir e corrigir (um passo que só aparece uma vez).
- A lista de inscritos mostra Player ID, nome, sobrenome e ano de nascimento, cada um com botão de copiar.

## 3. TV

**Durante a rodada (layout `tv-rodada-v3`)**
- Todas as mesas numa página só, sem trocar de tela. Mesas **uma abaixo da outra, em ordem crescente**; até ~15 mesas, uma coluna; acima disso, mais colunas (até 3), cada uma descendo em ordem (1–15, 16–30…), e a letra diminui para caber.
- **Byes numa lista separada** à direita ("Bye nesta rodada"), com o QR de entrada tardia embaixo ("Chegou agora? Escaneie para entrar").
- **Resultado sem placar:** quando a mesa fica verde (os dois lados reportaram de acordo ou o ADM ajustou), o vencedor fica destacado e o perdedor apagado/riscado; empate tem marcação própria. Antes do verde, só os nomes e a cor.
- A ordem crescente vem do servidor (a rodada é sempre devolvida ordenada pelo número da mesa), e vale igual para o painel do ADM e para a TV. Hoje nada ordena: a ordem é a do arquivo.

**Cronômetro**
- Os segundos atrasam/pulam. Hipótese a confirmar: a TV acerta o relógio pelo `serverTime` de uma resposta que fica até 5 s no cache do CloudFront. Correção esperada: descontar a idade da resposta (cabeçalho `Age`) ao calcular a diferença de relógio. O construtor confirma a causa antes de corrigir.

**Classificação parcial**
- O TOM grava um arquivo de classificação (standings) a cada rodada. Hoje só o da última rodada é usado; os parciais chegam e ficam guardados sem uso.
- A TV mostra a **classificação parcial só quando esse arquivo chega**, depois que todas as mesas da rodada fecharam, e fica até **o pareamento da rodada seguinte chegar** (aí volta para as mesas). Sem arquivo, não mostra nada inventado.
- Mesmo layout da classificação final (posição, jogador, V-D-E, pontos, % oponentes), com o título "Classificação após a rodada N".

**Fim do evento e reexibição**
- Quando o TOM manda a classificação da última rodada, a TV mostra a classificação final (como hoje).
- **Encerrar** o evento limpa a TV.
- Sem evento ativo, a TV mostra a **tela de espera com o logo da loja** (imagem fixa do site).
- No painel, o ADM escolhe um evento encerrado que tenha classificação final e usa **"Mostrar classificação na TV"** / **"Tirar da TV"**, a qualquer momento. O evento ativo tem prioridade: criar um evento novo tira a classificação reexibida, e com evento ativo a TV mostra o evento ativo.

## 4. Painel do ADM e jogador

- **Ajuste de resultado:** o campo "Motivo" sai. A auditoria continua com autor e horário.
- **Configuração do evento:** sai o botão Salvar. Tempo de rodada grava ao sair do campo; cada juiz grava ao marcar/desmarcar; aviso curto "salvo" ou o erro real.
- **Tempo de rodada padrão: 50 minutos** (hoje 30).
- **Nome do evento:** se o nome do torneio que vem do TOM for diferente do digitado na criação, o evento passa a usar o do TOM, sempre (em cada envio).
- **Trava do jogador:** depois de enviar o reporte, a tela do jogador mostra "Resultado enviado" e não deixa reportar de novo (hoje dá para corrigir até a mesa ficar verde). Correção só pelo juiz ou ADM. A API também recusa um segundo reporte do mesmo lado.
- **Aviso de pendentes que bloqueava o início:** some junto com a confirmação de presença (item 1).

## 5. Pagamento por evento

- Na guia Inscritos, cada inscrito tem **Pago / Não pago** (começa em "Não pago"), trocado com um clique a qualquer momento até o encerramento; contador "12 de 18 pagos" no topo. Entradas tardias aprovadas também.
- Não bloqueia nada: joga sem pagar. Ao encerrar, aviso "N inscritos sem pagamento" com a opção de encerrar mesmo assim.
- Cada inscrição gera, no cadastro do jogador, o registro **nome do evento, data e pago/não pago**. Na guia Jogadores, ao abrir um jogador, o ADM vê essa lista.
- **Só o ADM vê.** O jogador não vê o próprio status.
- Retenção: segue a regra de retenção já existente para dados do jogador (`spec-tom.md`).

## 6. Guia Jogadores

- Abre com a **lista de todos os jogadores cadastrados**, em ordem alfabética, e uma busca por **Player ID, nome ou e-mail** (a busca roda no servidor sobre os dados completos).
- Colunas, mascaradas **no servidor**:
  - Player ID completo;
  - só o primeiro nome;
  - e-mail com os 3 primeiros caracteres + `@domínio` (ex.: `duk•••@gmail.com`);
  - telefone só com os 4 últimos números (ex.: `•••• 1234`).
- Ano de nascimento não aparece.
- Ao abrir um jogador: os mesmos dados mascarados e a lista de eventos com pagamento (item 5). As ações atuais (Desfazer vínculo) continuam.

## 7. QR de convite para juiz

- Na guia Equipe, **"Gerar convite de juiz"** mostra um QR e um link para copiar, **só no painel** (nunca na TV).
- Quem escaneia entra ou cria a conta (juiz é conta comum com Player ID); ao terminar, a conta recebe a marca de juiz da equipe. A escalação por evento continua manual.
- **Uso único** e **vale 15 minutos**. Depois de usado ou vencido: "Convite já utilizado ou vencido". O ADM pode ter vários convites abertos e cancelar qualquer um; a guia Equipe lista os abertos com o tempo restante.
- A busca e a marcação manual de juiz continuam.

## 8. TV dentro da ferramenta do ADM

- A TV deixa de ser página pública: `/tv` e o quadro da API passam a ser **só do ADM**, como o resto do painel. A forma de usar não muda: o ADM abre pelo "Abrir TV ↗" no notebook já logado e projeta na TV.
- Sem sessão de ADM, `/tv` leva ao login e a API recusa o quadro e as fotos.
- O cache compartilhado de 5 s do CloudFront no quadro sai (resposta privada). Uma TV consultando a cada 5 s fica dentro do gratuito da Lambda (US$ 0).

## 9. Foto do jogador

- No perfil, o jogador escolhe ou tira uma foto; o celular corta em quadrado e reduz para 128×128 px (WebP, ~10 KB) antes de enviar. Pode trocar ou remover quando quiser; o ADM pode remover uma foto inadequada na guia Jogadores.
- Aparece numa bolinha **antes do nome** na mesa: na TV e na tela do celular (a sua e a do oponente). Sem foto: avatar genérico.
- **Consentimento de imagem para menores (LGPD, consentimento específico):** o perfil de quem tem menos de 18 anos ganha a caixa **"O responsável autoriza mostrar a foto nas mesas"**, desmarcada por padrão e separada do consentimento do cadastro. Pode ser desmarcada a qualquer momento.
- **Menor sem essa autorização: a foto enviada nunca aparece**, nem na TV nem no celular do oponente; no lugar fica o avatar genérico. Quem decide é o servidor. Ao completar 18 anos, a regra deixa de valer.
- Recurso AWS novo: um bucket S3 privado; as fotos são entregues só a quem está autorizado a ver aquela mesa (ADM na TV, jogadores da mesa). Projeção: 1.000 fotos ≈ 10 MB ≈ menos de US$ 0,01/mês.

## 10. Logo da loja

- O arquivo vai para a raiz do projeto (o usuário coloca). Onde usar fica a critério do construtor: tela de espera da TV (obrigatório), topo da TV, menu lateral do ADM, página inicial e ícone do site.
- Enquanto o arquivo não existir, o lugar mostra o nome "Good Gamë" em texto.

## Ordem das entregas

Uma por PR, cada uma testada antes da próxima:

1. Ciclo do evento e entrada tardia (item 1).
2. Cadastro com nome e sobrenome (item 2).
3. TV (item 3), podendo dividir em: layout + ordem + vencedor + byes; cronômetro; classificação parcial; fim do evento, reexibição e logo.
4. Painel do ADM e trava do jogador (item 4).
5. Pagamento por evento (item 5).
6. Guia Jogadores (item 6).
7. Convite de juiz (item 7).
8. TV só do ADM (item 8), antes da foto.
9. Foto do jogador (item 9).

O logo (item 10) entra junto com a entrega da TV.

## Restrições

- Único recurso AWS novo: o bucket das fotos (item 9). Os outros dados novos (entrada tardia, pagamento, convites, parciais) cabem nas tabelas atuais. Outro recurso novo, se surgir, vem com a diferença de custo e a projeção.
- A TV continua com consulta periódica (agora autenticada, sem cache compartilhado).
- O quadro da TV só leva nomes e fotos, nunca Player ID, e-mail ou telefone.

## Decisões tomadas por mim (para conferir)

- O QR fica pequeno no canto da TV durante as rodadas e some no encerramento.
- Entrada tardia recusada não pode pedir de novo pelo QR.
- Nome existente separado no primeiro espaço, com conferência única no próximo acesso.
- O vencedor só aparece na TV quando a mesa fica verde (você marcou na tela).
- Até 3 colunas na TV (~45 mesas) antes de voltar a paginar.
- O logo da tela de espera é uma imagem fixa do site.
- Configuração do evento grava ao sair do campo / ao marcar o juiz.
- A API recusa segundo reporte do mesmo lado (não só a tela).
- Pagamento começa em "Não pago" e é editável só até o encerramento.
- Guia Jogadores em ordem alfabética; ano de nascimento não aparece.
- Convites de juiz: vários abertos ao mesmo tempo, canceláveis.
