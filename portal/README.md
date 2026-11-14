# Portal de rastreamento TransLog

Parte do Desafio Final do Academy IPNET 2026, Grupo 3. Responsável: Matheus van Deursen (FullStack).

Este documento explica o portal para todas as pessoas envolvidas no projeto, desenvolvedoras ou não. Os detalhes técnicos do servidor e da interface estão em [docs/backend.md](docs/backend.md).

## Em uma frase

O portal é o site em que o cliente da TransLog digita o número do pedido e descobre, sem precisar ligar para a central, em que situação o pedido está, se atrasou e qual o motivo provável — podendo também tirar dúvidas na hora com o assistente virtual da operadora.

## O problema que ele resolve

A TransLog é uma operadora logística internacional (fictícia). Ela despacha pedidos de lojas virtuais a partir dos EUA e de Porto Rico para cinco mercados (América do Norte, América Latina, Europa, Ásia-Pacífico e África), em quatro níveis de serviço: Standard Class, Second Class, First Class e Same Day.

Dois problemas motivam o portal:

- **O cliente não tem um canal simples para acompanhar o pedido.** Toda dúvida vira ligação ou e-mail para a central de atendimento.
- **O prazo prometido nem sempre é realista.** Justamente as modalidades mais rápidas são as que mais atrasam. É a "promessa irreal" que o projeto investiga.

## Como o cliente usa o portal

1. Abre o portal e digita o número do pedido (ou clica num dos atalhos de exemplo: `#15`, `#375`, `#562`, `#1002`).
2. Vê imediatamente, num painel com visual de guia de remessa internacional, a **previsão ou data de entrega**, o **cumprimento do prazo** (quantos dias atrasou ou adiantou), a **modalidade contratada** e a **data do pedido**.
3. Quando há um motivo provável registrado para o atraso, vê um destaque âmbar explicando esse motivo (sem nunca afirmá-lo como certeza absoluta) com o botão **"Perguntar ao assistente"**.
4. Ao clicar no botão ou digitar uma pergunta no painel lateral, o **Assistente TransLog** responde em linguagem direta e simples (por exemplo, explicando por que o prazo de 2 dias da Second Class provavelmente foi curto para a rota Texas → Saltillo).
5. Logo abaixo, acompanha o **trajeto internacional** (Origem → Mercado/Região → Destino) integrado à **linha do tempo de 4 etapas** e a tabela de **itens da remessa** com o valor total em dólar.

Essa é a cena da apresentação para a banca, em 23/11: alguém digita o número do pedido **375**, vê que atrasou 4 dias numa modalidade rápida, lê o motivo provável ("Promessa irreal") e pergunta ao assistente por quê.

Além da aplicação real em React (`portal/web/`), os protótipos visuais continuam disponíveis em `portal/prototipos/`, sendo [prototipos/translog-prototipo-direcao-d.html](prototipos/translog-prototipo-direcao-d.html) a direção visual escolhida e implementada.

## As partes do portal

| Parte | O que faz | Situação em 14/11 |
|---|---|---|
| **Tela** (`web/`) | Interface em React que o cliente vê e usa no navegador | **Pronta** — construída com o design da Direção D, consultando os pedidos no servidor do portal e com o assistente funcionando em modo demonstração |
| **Servidor do portal** (`api/`) | Recebe o número do pedido, busca os dados e devolve a resposta pronta para a tela | **Pronto** para a consulta de pedidos |
| **Contrato** (`contracts/`) | Lista combinada de cada informação que o servidor entrega à tela: nome, formato e valores possíveis | **Pronto** para pedidos (compartilhado entre servidor e tela) |
| **Conexão com o Agente de IA** | Leva a pergunta do cliente no servidor do portal até o agente em Python do Marco | Aguardando acordo final com o Marco sobre o formato da conversa (enquanto isso, o chat da tela responde com as regras de referência da demonstração) |

## Como a tela foi desenhada (Identidade Visual)

A interface segue a **Direção D (Manifesto & Rota Integrada)**, pensada para transmitir a personalidade da TransLog — confiável, precisa, sóbria e internacional:

- **Clareza antes de tudo:** os dados principais aparecem no topo do pedido divididos em 4 blocos lado a lado (`Previsão/Entrega`, `Cumprimento do prazo`, `Modalidade contratada` e `Pedido realizado em`).
- **Honestidade sem alarme:** o vermelho aparece **apenas** na célula de cumprimento do prazo e na etiqueta `Atrasado` quando há atraso real. Avisos de atenção (como o motivo provável e a liberação pendente) usam âmbar (`#F59E0B`), enquanto a marca usa azul-petróleo (`#0F4C81`).
- **Tipografia técnica de manifesto:** textos usam a fonte `Inter` para leitura rápida, enquanto números de pedido, códigos de manifesto (`TL-000375-LATAM`), datas, quantidades e valores em dólar usam fonte monoespaçada (`IBM Plex Mono`), facilitando a leitura de números.
- **Rota + Andamento no mesmo bloco:** em vez de uma barra de progresso genérica, a origem e o destino internacionais ficam nas duas pontas da própria linha do tempo de 4 etapas (`Pedido realizado` → `Pedido liberado` → `Em trânsito` → `Entregue`). Assim, até a tabela de itens cabe na primeira tela sem precisar rolar.
- **Assistente como canal oficial:** o painel lateral de 400 px apresenta as respostas como um parecer da própria TransLog (com barra lateral azul-petróleo), sugere perguntas iniciais, avisa sobre qual pedido está conversando e abre automaticamente na esquerda qualquer pedido cujo número o cliente cite na conversa.
- **Todos os estados previstos:** tela inicial vazia, carregamento (esqueleto animado), pedido não encontrado, falha de conexão com botão "Tentar novamente" e falha no envio de mensagem no chat com reenvio manual.

### Barra de controle da demonstração

No topo da tela há uma barra escura (**Direção D**), que pode ser ocultada num clique (ou adicionando `?bar=off` no endereço da página). Ela não faz parte do produto final do cliente: serve para a equipe e a banca alternarem em um clique entre qualquer pedido (`#15`, `#375`, `#562`, `#1002`, etc.), simularem estados de carregamento/erro e compararem ao vivo as duas decisões de interface ainda em aberto (como o chat se comporta ao trocar de pedido e como exibir pedidos aguardando confirmação de pagamento).

## Como o portal se conecta ao resto do projeto

```
  Base de pedidos             Servidor do portal               Tela do portal
  (Mateus, Dados)     ───►    (Matheus, FullStack)    ◄───►    (React, no navegador)
                                      │
                                      └───►  Assistente de IA (Marco)

  Painel de gestão (Marcelo, BI): usa a mesma base, voltado para a gestão da TransLog.
```

A tela conversa só com o servidor do portal. É o servidor que busca os dados e, depois, vai falar com o assistente de IA. Assim, nenhuma chave de acesso nem dado interno chega ao navegador do cliente.

## De onde vêm os dados

- A base é a **DataCo** (Kaggle), um conjunto público de pedidos de 2015 a 2018, usado para simular a operação da TransLog. Nenhum dado real de cliente.
- O Mateus trata essa base e gera a versão **Silver**, já traduzida para o português. A cópia usada hoje tem **65.752 pedidos** (180.519 itens).
- O portal funciona de dois jeitos:
  - **Pedidos de exemplo** (padrão): 11 pedidos escolhidos da base, que já vêm junto com o portal. Liga na hora, sem precisar de nenhum arquivo extra.
  - **Base completa**: o servidor lê o arquivo da Silver (163 MB) ao ligar, o que leva cerca de 11 segundos. Depois disso, qualquer um dos 65.752 pedidos pode ser consultado na tela.
- O arquivo da Silver **nunca vai para o GitHub**: é grande e contém campos internos sobre clientes. Cada pessoa guarda a própria cópia na pasta `portal/dados/`, que fica só no computador dela.

## O que o portal mostra sobre um pedido

| Informação | Exemplo (pedido 375) |
|---|---|
| Número e código de manifesto | `#375` · `TL-000375-LATAM` |
| Data do pedido | 06/01/2015 |
| Modalidade de envio | Second Class (Prazo estimado: 2 dias) |
| Situação | Em Trânsito |
| Prazo | Atrasado |
| Dias de atraso | +4 dias |
| Faixa de atraso | Atraso Crítico (3+ dias) |
| Entrega prevista | 08/01/2015 |
| Entrega realizada | ainda não entregue |
| Origem → destino | San Benito, Texas, Estados Unidos → Saltillo, Coahuila, México |
| Região e mercado | América Central · LATAM |
| Itens | 2 itens, cada um com produto, categoria, quantidade e valor |
| Total | US$ 91,34 |
| Motivo provável do atraso | Promessa irreal (por enquanto, nos pedidos de exemplo; ver "Pontos em aberto") |

Alguns valores aparecem em inglês porque é assim que vêm da base: modalidade, mercado e nomes de produtos.

### Situação e prazo são coisas diferentes

A **situação** diz em que etapa o pedido está:

- **Entregue**: chegou ao destino.
- **Em Trânsito**: já saiu e está a caminho.
- **Aguardando Liberação**: registrado, mas ainda não liberado para envio (por exemplo, pagamento pendente).
- **Cancelado**: não será enviado.

O **prazo** diz se a data prometida foi cumprida:

- **No Prazo**, **Adiantado** ou **Atrasado**.
- **Não Avaliado**: o pedido ainda não foi liberado, então não dá para avaliar.
- **Cancelado**.

Um pedido pode estar "Em Trânsito" e já "Atrasado", como o 375.

O motivo do atraso é sempre apresentado como **provável**, nunca como causa comprovada.

## Privacidade

O portal **nunca mostra**, e o servidor nem chega a guardar:

- identificação e segmento do cliente;
- forma de pagamento;
- lucro, margem e descontos;
- coordenadas geográficas;
- o resumo em texto que a base prepara para o assistente (ele cita o número do cliente).

Esses campos são descartados no momento em que o servidor lê a base. Testes automáticos conferem, a cada mudança no código, que nenhuma resposta traz essas informações.

## Pedidos de exemplo

São pedidos reais da base, escolhidos para cobrir todas as situações da tela. Os quatro primeiros aparecem como atalhos rápidos logo abaixo do campo de busca e são os usados na demonstração.

| Pedido | Cenário |
|---|---|
| 15 | Entregue, com 2 dias de atraso, sem motivo provável |
| 375 | Em Trânsito, atraso crítico (4 dias), com motivo provável de exemplo ("Promessa irreal") |
| 562 | Aguardando Liberação |
| 1002 | Cancelado (suspeita de fraude) |
| 10453 | Entregue no prazo (Europa) |
| 20322 | Entregue adiantado (Ásia-Pacífico) |
| 31398 | Em Trânsito, dentro do prazo (América do Norte) |
| 225 | First Class atrasado |
| 41906 | Same Day atrasado (África) |
| 16 | Aguardando Liberação (pagamento pendente) |
| 552 | Cancelado pelo cliente |

## O que já foi verificado (14/11)

- **129 testes automáticos** passando (105 no servidor + 24 na interface React).
- **Tela React (`@translog/web`) pronta**, validando todas as respostas do servidor pelo contrato compartilhado e compilando para produção em menos de 1 segundo.
- Base completa: os 65.752 pedidos foram carregados sem nenhuma linha com problema, em cerca de 11 segundos.
- Cada consulta é respondida em **menos de 1 milésimo de segundo**.
- Os 65.752 pedidos foram conferidos, um a um, contra o script de referência usado para gerar os exemplos: todos iguais.
- O servidor roda em **Docker**, tanto com os exemplos quanto com a base completa.

## Pontos em aberto

| Assunto | Com quem | Por que importa |
|---|---|---|
| Motivo provável do atraso | Mateus e Marcelo | A base ainda não tem essa informação. Hoje os exemplos têm ("Promessa irreal" no 375); com a base completa, nenhum pedido mostra o aviso. Precisa estar resolvido para a demo |
| Base usada na demo | Grupo | Pedidos de exemplo (11, com motivo provável no 375) ou base completa (todos os pedidos, sem motivo provável) |
| Formato da conversa com o assistente | Marco | Necessário para ligar o chat da tela ao agente em Python (enquanto isso, o chat da tela já funciona com as respostas de referência) |
| Versão final da base (Silver ou Gold) | Mateus | Se as colunas mudarem, só uma parte pequena do servidor precisa ser ajustada |
| Comportamento do chat ao trocar de pedido e rótulo de pagamento não processado | Matheus / Grupo | As opções já estão prontas e podem ser alternadas ao vivo na barra superior da tela para decisão final |

## Próximos marcos do projeto

| Data | Marco |
|---|---|
| 17/11 | Checkpoint: MVP parcial |
| 19/11 | Code freeze e demonstração completa |
| 23/11 | Banca |

## Como ver funcionando

### 1. Tela completa + Servidor (modo de desenvolvimento)

Com o Node 24 e o `pnpm` instalados:

```bash
cd portal
pnpm install
pnpm dev
```

Esse comando liga o servidor (`http://localhost:3333`) e a tela do portal (`http://localhost:5173`) ao mesmo tempo. Basta abrir [http://localhost:5173](http://localhost:5173) no navegador, clicar no exemplo **#375** e interagir com o rastreio e com o assistente.

### 2. Servidor via Docker (documentação interativa da API)

```bash
cd portal
docker compose up --build
```

Depois, abra [http://localhost:3333/docs](http://localhost:3333/docs) no navegador para ver e testar os endereços da API diretamente. Para usar a base completa ou ver mais comandos, consulte [docs/backend.md](docs/backend.md).

## Glossário

| Termo | Significado |
|---|---|
| API | A "porta de entrada" do servidor: os endereços que a tela (ou outro sistema) chama para pedir dados |
| Backend / servidor | A parte do sistema que roda fora do navegador e cuida dos dados |
| Frontend / tela | O que aparece no navegador do cliente (construído em React na pasta `web/`) |
| Contrato | Acordo escrito sobre quais informações a API entrega e em que formato. Tela e servidor seguem o mesmo contrato |
| Silver / Gold | Etapas do tratamento dos dados feito pelo Mateus. Silver: dados limpos e traduzidos. Gold: dados prontos para consumo |
| Pedidos de exemplo (fixtures) | Os 11 pedidos que já vêm junto com o portal |
| Docker | Ferramenta que empacota o servidor para ele funcionar do mesmo jeito em qualquer computador |
| Documentação da API (`/docs`) | Página gerada automaticamente que descreve a API e permite testá-la pelo navegador |
| Teste automático | Verificação escrita em código, que roda a cada mudança para garantir que nada quebrou |

## Pessoas ligadas ao portal

| Pessoa | Papel | Relação com o portal |
|---|---|---|
| Matheus van Deursen | FullStack | Responsável pelo portal (servidor e tela) |
| Mateus Maciel | Engenharia de Dados | Fornece a base de pedidos (Silver e, depois, Gold) |
| Marco Aurélio | Engenharia de IA | Assistente que vai responder no chat |
| Marcelo Pimenta | BI | Painel de gestão; motivo provável do atraso, junto com o Mateus |
| Stephanie Lopes | Gestão de Projetos | Acompanhamento e documentação do projeto |

## Onde está cada coisa nesta pasta

| Pasta ou arquivo | Conteúdo |
|---|---|
| `web/` | Tela do portal em React (`@translog/web`) |
| `api/` | Servidor do portal (`@translog/api`) |
| `contracts/` | Contrato compartilhado entre o servidor e a tela (`@translog/contracts`) |
| `prototipos/` | Protótipos visuais em HTML (incluindo a Direção D escolhida) |
| `docs/backend.md` | Documentação técnica completa (backend, contratos e frontend) |
| `tasks.md` | Lista de tarefas por fase, com o que já foi feito |
| `dados/` | Cópia local da base (fica só no computador, nunca vai para o GitHub) |
