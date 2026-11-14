# Portal de rastreamento TransLog

Parte do Desafio Final do Academy IPNET 2026, Grupo 3. Responsável: Matheus van Deursen (FullStack).

Este documento explica o portal para todas as pessoas envolvidas no projeto, desenvolvedoras ou não. Os detalhes técnicos estão em [docs/backend.md](docs/backend.md).

## Em uma frase

O portal é o site em que o cliente da TransLog digita o número do pedido e descobre, sem precisar ligar para a central, em que situação o pedido está, se atrasou e qual o motivo provável. Ele também vai poder tirar dúvidas com um assistente virtual.

## O problema que ele resolve

A TransLog é uma operadora logística internacional (fictícia). Ela despacha pedidos de lojas virtuais a partir dos EUA e de Porto Rico para cinco mercados (América do Norte, América Latina, Europa, Ásia-Pacífico e África), em quatro níveis de serviço: Standard Class, Second Class, First Class e Same Day.

Dois problemas motivam o portal:

- **O cliente não tem um canal simples para acompanhar o pedido.** Toda dúvida vira ligação ou e-mail para a central de atendimento.
- **O prazo prometido nem sempre é realista.** Justamente as modalidades mais rápidas são as que mais atrasam. É a "promessa irreal" que o projeto investiga.

## Como o cliente vai usar

1. Abre o portal e digita o número do pedido (ou clica num dos exemplos).
2. Vê a situação do pedido, o prazo, quantos dias atrasou (se atrasou), a rota e os itens com valores.
3. Se houver um motivo provável registrado para o atraso, vê um aviso com esse motivo.
4. Pode perguntar ao assistente, por exemplo, "Por que meu pedido atrasou?".

Essa é a cena da apresentação para a banca, em 23/11: alguém digita um número de pedido, vê que atrasou e pergunta ao assistente por quê.

A aparência da tela já está desenhada num protótipo navegável: abra [prototipos/translog-prototipo.html](prototipos/translog-prototipo.html) no navegador. A barra escura no topo do protótipo serve só para mostrar os diferentes estados da tela; ela não faz parte do produto.

## As partes do portal

| Parte | O que faz | Situação em 14/11 |
|---|---|---|
| **Tela** (frontend) | O que o cliente vê e usa no navegador | Desenho pronto no protótipo. A construção começa quando o design estiver fechado |
| **Servidor do portal** (backend) | Recebe o número do pedido, busca os dados e devolve a resposta pronta para a tela | **Pronto** para a consulta de pedidos |
| **Contrato** | Lista combinada de cada informação que o servidor entrega à tela: nome, formato e valores possíveis | **Pronto** para pedidos |
| **Chat com o assistente** | Leva a pergunta do cliente ao assistente de IA e traz a resposta | Aguardando acordo com o Marco sobre o formato da conversa |

## Como o portal se conecta ao resto do projeto

```
  Base de pedidos             Servidor do portal               Tela do portal
  (Mateus, Dados)     ───►    (Matheus, FullStack)    ◄───►    (o cliente, no navegador)
                                      │
                                      └───►  Assistente de IA (Marco)

  Painel de gestão (Marcelo, BI): usa a mesma base, voltado para a gestão da TransLog.
```

A tela conversa só com o servidor do portal. É o servidor que busca os dados e, depois, vai falar com o assistente. Assim, nenhuma chave de acesso nem dado interno chega ao navegador do cliente.

## De onde vêm os dados

- A base é a **DataCo** (Kaggle), um conjunto público de pedidos de 2015 a 2018, usado para simular a operação da TransLog. Nenhum dado real de cliente.
- O Mateus trata essa base e gera a versão **Silver**, já traduzida para o português. A cópia usada hoje tem **65.752 pedidos** (180.519 itens).
- O portal funciona de dois jeitos:
  - **Pedidos de exemplo** (padrão): 11 pedidos escolhidos da base, que já vêm junto com o portal. Liga na hora, sem precisar de nenhum arquivo extra.
  - **Base completa**: o servidor lê o arquivo da Silver (163 MB) ao ligar, o que leva cerca de 11 segundos. Depois disso, qualquer um dos 65.752 pedidos pode ser consultado.
- O arquivo da Silver **nunca vai para o GitHub**: é grande e contém campos internos sobre clientes. Cada pessoa guarda a própria cópia na pasta `portal/dados/`, que fica só no computador dela.

## O que o portal mostra sobre um pedido

| Informação | Exemplo (pedido 375) |
|---|---|
| Número do pedido | 375 |
| Data do pedido | 06/01/2015 |
| Modalidade de envio | Second Class |
| Situação | Em Trânsito |
| Prazo | Atrasado |
| Dias de atraso | 4 |
| Faixa de atraso | Atraso Crítico (3+ dias) |
| Entrega prevista | 08/01/2015 |
| Entrega realizada | ainda não entregue |
| Origem → destino | San Benito, Texas, Estados Unidos → Saltillo, Coahuila, México |
| Região e mercado | América Central · LATAM |
| Itens | 2 itens, cada um com produto, categoria, quantidade e valor |
| Total | US$ 91,34 |
| Motivo provável do atraso | Promessa irreal (por enquanto, só nos pedidos de exemplo; ver "Pontos em aberto") |

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

São pedidos reais da base, escolhidos para cobrir todas as situações da tela. Os quatro primeiros aparecem como atalhos na tela e são os usados na demonstração.

| Pedido | Cenário |
|---|---|
| 15 | Entregue, com 2 dias de atraso, sem motivo provável |
| 375 | Em Trânsito, atraso crítico, com motivo provável de exemplo ("Promessa irreal") |
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

- **105 testes automáticos** passando.
- Base completa: os 65.752 pedidos foram carregados sem nenhuma linha com problema, em cerca de 11 segundos.
- Cada consulta é respondida em **menos de 1 milésimo de segundo**.
- Os 65.752 pedidos foram conferidos, um a um, contra o script de referência usado para gerar os exemplos: todos iguais.
- O servidor roda em **Docker** (um "pacote" que funciona do mesmo jeito em qualquer computador), tanto com os exemplos quanto com a base completa.

## Pontos em aberto

| Assunto | Com quem | Por que importa |
|---|---|---|
| Motivo provável do atraso | Mateus e Marcelo | A base ainda não tem essa informação. Hoje só o exemplo 375 tem ("Promessa irreal"); com a base completa, nenhum pedido mostra o aviso. Precisa estar resolvido para a demo |
| Base usada na demo | Grupo | Pedidos de exemplo (11, com motivo provável no 375) ou base completa (todos os pedidos, sem motivo provável) |
| Formato da conversa com o assistente | Marco | Necessário para construir o chat |
| Versão final da base (Silver ou Gold) | Mateus | Se as colunas mudarem, só uma parte pequena do servidor precisa ser ajustada |
| Construção da tela | Matheus | Começa quando o design do protótipo estiver fechado |

## Próximos marcos do projeto

| Data | Marco |
|---|---|
| 17/11 | Checkpoint: MVP parcial |
| 19/11 | Code freeze e demonstração completa |
| 23/11 | Banca |

## Como ver funcionando

Precisa do Docker instalado no computador (normalmente, alguém do time técnico ajuda):

```bash
cd portal
docker compose up --build
```

Depois, abra [http://localhost:3333/docs](http://localhost:3333/docs) no navegador. Essa página lista tudo o que o servidor oferece e permite testar uma consulta:

1. Clique em **GET /api/orders/{orderId}**.
2. Clique em **Try it out**.
3. Digite `375` e clique em **Execute**.

A resposta aparece logo abaixo. Para usar a base completa ou rodar em modo de desenvolvimento, veja [docs/backend.md](docs/backend.md).

## Glossário

| Termo | Significado |
|---|---|
| API | A "porta de entrada" do servidor: os endereços que a tela (ou outro sistema) chama para pedir dados |
| Backend / servidor | A parte do sistema que roda fora do navegador e cuida dos dados |
| Frontend / tela | O que aparece no navegador do cliente |
| Contrato | Acordo escrito sobre quais informações a API entrega e em que formato. Tela e servidor seguem o mesmo contrato |
| Silver / Gold | Etapas do tratamento dos dados feito pelo Mateus. Silver: dados limpos e traduzidos. Gold: dados prontos para consumo |
| Pedidos de exemplo (fixtures) | Os 11 pedidos que já vêm junto com o portal |
| Docker | Ferramenta que empacota o servidor para ele funcionar do mesmo jeito em qualquer computador |
| Documentação da API (`/docs`) | Página gerada automaticamente que descreve a API e permite testá-la pelo navegador |
| Teste automático | Verificação escrita em código, que roda a cada mudança para garantir que nada quebrou |

## Pessoas ligadas ao portal

| Pessoa | Papel | Relação com o portal |
|---|---|---|
| Matheus van Deursen | FullStack | Responsável pelo portal |
| Mateus Maciel | Engenharia de Dados | Fornece a base de pedidos (Silver e, depois, Gold) |
| Marco Aurélio | Engenharia de IA | Assistente que vai responder no chat |
| Marcelo Pimenta | BI | Painel de gestão; motivo provável do atraso, junto com o Mateus |
| Stephanie Lopes | Gestão de Projetos | Acompanhamento e documentação do projeto |

## Onde está cada coisa nesta pasta

| Pasta ou arquivo | Conteúdo |
|---|---|
| `api/` | Servidor do portal |
| `contracts/` | Contrato entre o servidor e a tela |
| `prototipos/` | Protótipos visuais da tela (abrem no navegador) |
| `docs/backend.md` | Documentação técnica |
| `tasks.md` | Lista de tarefas por fase, com o que já foi feito |
| `dados/` | Cópia local da base (fica só no computador, nunca vai para o GitHub) |
