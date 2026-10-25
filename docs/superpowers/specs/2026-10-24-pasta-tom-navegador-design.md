# Spec: pasta do TOM conectada pelo navegador

## Por que

Hoje, para o site receber os relatórios do TOM, o ADM cria o evento, copia um comando com um token secreto e roda esse comando no PowerShell do notebook do TOM, trocando à mão o caminho da pasta. Isso depende de alguém digitar certo no dia do evento. Também exige o Node e uma cópia do projeto instalados no notebook, e o token aparece na tela, onde pode vazar num print.

O usuário quer que a conexão aconteça "sem intervenção humana": o ADM informa a pasta uma vez, e o sistema faz o resto.

## O que o usuário decidiu

- O painel do ADM fica aberto **no mesmo notebook** onde o TOM roda.
- A solução agora é **pelo navegador**: o próprio site lê a pasta do TOM e envia os relatórios.
- Um **executável** que roda em segundo plano fica registrado como evolução futura (abaixo). Não entra agora.

## Como funciona

- O cartão "Evento do dia" do ADM ganha o botão **"Conectar pasta do TOM"**. Ele abre a janela do Windows para escolher a pasta, pela File System Access API (`showDirectoryPicker`). O ADM escolhe uma vez.
- O navegador lembra a pasta: o identificador fica guardado no IndexedDB do site. Numa sessão nova, o navegador exige um clique para reautorizar a leitura, e o botão vira **"Permitir acesso à pasta TOM_DATA"**. É uma regra do navegador, sem como evitar.
- Com um evento ativo, a pasta autorizada e a página aberta, o site olha a pasta a cada poucos segundos e envia cada relatório novo ou alterado. As regras são as do enviador atual:
  - escolhe o torneio cujo arquivo foi regravado por último (`latestTournament`);
  - espera o arquivo ficar quieto e completo (`</html>` no fim);
  - não reenvia o que já foi enviado com o mesmo conteúdo.
- O envio usa o **login do ADM**. Não existe mais token na tela nem comando. A API aceita o envio do ADM para o **evento ativo**, com a mesma ingestão de hoje: integridade, fotografia, publicação da rodada e resultado final. O primeiro envio amarra o torneio do TOM ao evento, como hoje.
- O cartão mostra o estado em uma linha:
  - "Pasta não conectada";
  - "Conectado à pasta TOM_DATA · último envio às 14:32 (pareamento)";
  - "Sem permissão: clique em Permitir";
  - erro em vermelho, por exemplo "Torneio FODASE é de outro evento".
- O comando com o token **sai da tela** do ADM.

## Restrições

- Funciona no **Chrome ou no Edge**, os navegadores com File System Access. Em outro navegador, o cartão diz: "Use o Chrome ou o Edge neste notebook para conectar a pasta do TOM."
- O navegador nunca lê um caminho digitado. A pasta é sempre escolhida pela janela do Windows.
- A página precisa ficar aberta, mesmo atrás do TOM. Com a aba escondida por muito tempo, o navegador pode espaçar a verificação até cerca de 1 minuto. Ao voltar para a aba, ela envia na hora.
- O site só **lê** a pasta, nunca escreve nela.
- Custo: zero, sem recurso AWS novo.
- Tudo da spec principal continua valendo: TypeScript, domínio sem AWS, us-east-2, telas em pt-BR no `styles.css` atual.

## Objetivos, fora de escopo e o que não pode acontecer

Fora de escopo agora:
- O executável.
- Enviar relatórios sem a página aberta.
- Firefox e Safari.

Não pode acontecer:
- Enviar arquivos sem um evento ativo, ou para um evento encerrado ou cancelado.
- O token do enviador aparecer na tela.
- Mostrar "conectado" quando o navegador perdeu a permissão de leitura. A tela nunca mostra sucesso falso.
- Ler ou enviar arquivos fora da pasta escolhida.

## Decisões do construtor

- Reaproveitar a regra de escolha e envio do enviador atual (`apps/uploader/src/uploader.ts`) em vez de reescrevê-la. Por exemplo, tornar o núcleo independente do Node (hash e pasta injetados) e usá-lo nos dois lugares.
- Nome da rota de envio do ADM e como ela reaproveita a ingestão (`createIngest`).
- O intervalo da verificação, de 2 a 5 s.
- Como importar só o necessário de `@tom/tom-reports` no site sem levar os parsers de HTML para o pacote do navegador.

## Decisões tomadas por mim (para conferir)

- O enviador por comando (`npm run uploader`) **continua existindo** como plano B, documentado só no README. O token continua sendo gerado na criação do evento, mas não aparece mais na tela.
- **Evento de destino:** o envio pelo ADM vale só para o **evento ativo**. Pelo plano 4, só um pode estar ativo por vez: é o resultado de `EventService.active()`, com status `open`, `confirming`, `running` ou `final`. A rota não recebe id do evento. Sem evento ativo, nada é enviado, e o cartão diz "Crie o evento para começar a enviar".
- **Pasta com outro torneio do TOM:** se o evento já está amarrado ao torneio A e o arquivo mais recente da pasta é do torneio B, por exemplo um torneio de teste aberto no TOM, o envio é recusado pela regra que já existe (`tournament_mismatch`). O cartão mostra: "A pasta está com o torneio B, mas este evento é do torneio A. Abra o torneio A no TOM." Não há checagem nova entre eventos.
- **O que já foi enviado:** fica no IndexedDB do navegador, com a chave evento + arquivo + hash do conteúdo. Recarregar a página não reenvia tudo, e um evento novo começa do zero. Um reenvio não causa dano, porque o servidor responde "Versão já recebida".
- **A rota de envio do ADM:**
  - aceita o mesmo formato de hoje (`UploadRequest`), com o `sha256` calculado no navegador (Web Crypto, que existe no site em HTTPS e no `localhost`) e o mesmo limite de tamanho;
  - exige o login do ADM e reaproveita a ingestão depois da autorização (o nome da função fica com o construtor);
  - registra a autoria como "enviado pelo navegador do ADM `<conta>`".

## Evolução futura: executável

Um executável instalado uma vez no notebook, que abre sozinho com o Windows e envia em segundo plano, sem depender da aba aberta:
- O ADM **pareia** o executável pelo painel, que mostra um código.
- Daí em diante, ele envia sempre para o evento ativo.

Pontos a decidir quando chegar a hora:
- o certificado de assinatura (cerca de US$ 200 a 400 por ano, para evitar o aviso "Editor desconhecido");
- a distribuição das atualizações;
- a revogação do pareamento.
