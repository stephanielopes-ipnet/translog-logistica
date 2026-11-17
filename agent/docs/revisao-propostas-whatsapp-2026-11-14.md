# Revisão das propostas do WhatsApp — 14/11/2026

Fontes: conversa de 13/11 colada por Marco e imagem `WhatsApp Image 2026-11-13 at 16.53.07.jpeg`, lida nesta revisão. São registros de propostas/discussões do grupo; a sugestão gerada por Claude não é, por si só, contrato aprovado ou evidência sobre os dados. Números de telefone não foram reproduzidos.

O cenário internacional e a possibilidade de simulação já têm aprovação do mentor, conforme confirmação anterior de Marco. Isso não confirma automaticamente agente extra, colunas, limiares ou novas regras de negócio.

## Escopo observado e recomendação

- A conversa mostra concordância com atendimento por IA e visibilidade gerencial pelo dashboard.
- Inteligência interna de rotas é discutida como **extra**. Ainda há dúvida explícita entre um agente ou dois; não registrar essa decisão como tomada.
- A disposição de começar a persistência não aprova todas as fórmulas da imagem. Fechar o contrato entre Dados, BI, IA e FullStack antes de consolidá-las em tabelas compartilhadas.
- Recomendação: concluir primeiro consulta de pedidos e FAQ/políticas; depois disponibilizar métricas internas já calculadas em Gold. Um segundo agente não é pré-requisito para o dashboard ou para essas métricas.
- Funções internas devem ter acesso separado do atendimento público, mesmo se reutilizarem o mesmo projeto e as mesmas bibliotecas. Isso é orientação para eventual implementação, não autorização para alterar agora a API.

## Colunas sugeridas na imagem

| Proposta | Comparação com a Silver / ajuste recomendado |
| --- | --- |
| `atraso_dias = dias_reais - dias_previstos` | Já há `dias_atraso`. Preservar diferença com sinal e nulos dos não avaliados/cancelados. A fórmula não deve preencher os 79.510 vazios automaticamente. Definir um nome canônico ou mapeamento, sem duas versões divergentes. |
| `no_prazo = 1 se atraso_dias <= 0` | Adequado nos elegíveis, incluindo adiantados. Deve continuar nulo quando o atraso não é avaliado. `NULL <= 0` não deve virar zero, e nulo não pode virar um. |
| `faixa_atraso` | Já há `janela_atraso`. A proposta agrupa No Prazo, 1–2 e 3+; definir se No Prazo inclui adiantados e preservar também Não Avaliado/Cancelado. Não perder significado silenciosamente. |
| `data_entrega_prevista = order_date + dias_previstos` | Já há `data_prevista_entrega`, reproduzível pela fórmula em todas as linhas. Documentar que é data calculável e validar precisão por dia/hora, especialmente Same Day. Não é ETA atual comprovada. |
| `data_entrega_real = order_date + dias_reais` | **Não adotar como entrega real comprovada.** A diferença em dias coincide com calendário UTC, mas o CSV não comprova que esse instante seja uma entrega. Para 9.737 itens Same Day há intervalos de 12h, perdidos na soma de dias inteiros. Se útil, manter como estimativa/derivado identificado até Dados confirmar a semântica. |
| `rota = mercado · região · modal` | É segmento analítico; difere de `rota_logistica`, que usa origem e destino em texto. Criar chave explícita `mercado, região, classe_servico`, sem chamar de trajeto/GPS. Os valores de modo_envio são classes, não caminhão/avião/navio. |
| `ano_mes` | Derivação válida da data escolhida, desde que se declare coorte por pedido ou envio e fuso. `YYYY-MM` preserva o ano; não juntar janeiro de anos diferentes sem querer. |
| `periodo_pico = novembro/dezembro` | Pode ser indicador de calendário ou hipótese de sazonalidade. O rótulo não demonstra que esses meses tiveram pico de volume nem pior desempenho nesta base. Medir antes de afirmar. |
| `receita_em_risco = Sales se atrasou, senão 0` | Tratar como valor de vendas associado a pedidos atrasados, não perda comprovada de receita. Definir bruto/líquido, moeda, elegibilidade e granularidade. Para não avaliados, evitar zero que sugira risco conhecido. Somar valores de item uma vez, sem repetir total por pedido. |
| `causa_provavel` | A imagem diz que há uma regra abaixo, mas essa regra não aparece no recorte recebido. Não foi possível avaliá-la. Atraso não comprova causa. Se o grupo usar “promessa irreal”, rotular como hipótese/diagnóstico de compatibilidade entre prazo prometido e distribuição histórica, nunca causa factual de cada pedido. |

Não foi aplicada nenhuma dessas colunas à base ou ao código.

## Percentuais: calcular na versão e população usadas pelo grupo

Recalculei em **pedidos distintos**, usando o SHA-256 da Silver já auditada (`133b31ddcccf7358b00870faa1e89b99a9fdba88e6ae83a85bdd0f5fd55d409c`). A tabela principal abaixo usa apenas pedidos com `flag_atrasado` preenchida: inclui CLOSED, COMPLETE e PROCESSING conforme a regra observada, que ainda exige validação de negócio.

| Classe | Pedidos avaliados | Pedidos classificados como atrasados | Percentual |
| --- | ---: | ---: | ---: |
| Standard Class | 22.024 | 8.754 | 39,75% |
| Second Class | 7.162 | 5.718 | 79,84% |
| First Class | 5.693 | 5.693 | 100,00% |
| Same Day | 1.987 | 962 | 48,41% |
| Total | 36.866 | 21.127 | 57,31% |

Se o filtro for somente situação derivada Entregue (CLOSED/COMPLETE), são 16.633 classificados como atrasados entre 28.965 pedidos: 57,42%. Por classe: Standard 39,76%; Second 80,09%; First 100%; Same Day 48,51%. A validade de “Entregue” continua dependente do mapeamento dos status.

A diferença numérica indiscriminada sobre todos os 65.752 pedidos daria 57,33%, mas inclui registros que a própria Silver deixa sem avaliação. Não usar esse recorte como taxa oficial de atraso.

Os números de aproximadamente 55%, 95%, 77%, 46% e 38% citados de análises públicas não são os resultados deste recorte. Sem as fontes e seus filtros exatos, não concluir que a outra análise está errada: comparar versão, unidade (item/pedido), elegibilidade e definição do atraso. Usar os próprios cálculos reproduzíveis na entrega.

**Não confundir rapidez com pontualidade:** todos os itens First Class desta exportação têm um dia programado e dois registrados. Standard tem quatro dias programados e de dois a seis registrados. First Class pode registrar menor duração e maior atraso em relação à promessa. Taxa de atraso isolada não prova qual classe é a melhor opção absoluta.

O arquivo não fornece tarifa de frete por classe. “O cliente paga mais pelo rápido” pode ser premissa comercial do cenário ou contexto externo, não conclusão financeira demonstrada pelo preço dos produtos.

## P80 e classificação ouro/prata/bronze

Uma referência histórica P80 é uma proposta viável de análise. Exemplo de leitura: 80% dos registros elegíveis do grupo tinham duração registrada até X dias. Isso não garante o próximo pedido, nem equivale a previsão individual ou promessa aprovada ao cliente.

Antes de publicar, definir com Dados/BI:

1. Campo de duração e evento correspondente; até confirmação, usar “dias registrados”, não afirmar “tempo até entrega”.
2. População de entregas elegíveis, uma observação por pedido; cancelados/pendentes não entram como entregas concluídas.
3. Segmentação por mercado/região/classe e período de referência, algoritmo do percentil, amostra mínima e tratamento de grupos escassos.
4. Comparação por **região**, considerando as classes como alternativas. Se a chave da rota já contém classe, comparar os grupos irmãos, não escolher a melhor classe dentro de um grupo que só tem uma.
5. Objetivo da comparação: pontualidade, duração, custo ou outro. A base não demonstra por si só economia de frete ou superioridade causal de uma classe.
6. Limiares e versão da classificação ouro/prata/bronze. Esses nomes de desempenho são distintos das camadas Bronze/Silver/Gold do pipeline; nomes de campos claros evitam confusão.

Recomendação para o extra: tabela **Gold agregada por segmento**, com quantidade de pedidos elegíveis, percentual no prazo, duração P80, período/fonte e classificação segundo regra aprovada. A LLM explica os resultados calculados por Dados/BI; não inventa fórmulas ou limites durante a resposta. O nome e o esquema final da tabela continuam pendentes.

## Estatísticas externas da conversa

- **58%:** localizado no [comunicado da project44 de 01/10/2024](https://www.prnewswire.com/news-releases/project44s-the-state-of-consumer-holiday-shopping-2024-reveals-consumers-are-starting-holiday-shopping-earlier-302263341.html), com pesquisa de mais de 1.300 consumidores, e na [reportagem Retail Brew de 07/10/2024](https://www.retailbrew.com/stories/2024/10/07/more-than-half-of-shoppers-unlikely-to-return-to-a-retailer-that-misses-promised-delivery-date). É intenção declarada de compra em pesquisa externa, não taxa de perda de clientes da TransLog.
- **39%:** a [RetailWire de 29/10/2024](https://retailwire.com/discussion/should-consumers-be-compensated-for-delivery-mishaps/) relata pesquisa HubBox com mais de mil compradores dos EUA. A formulação é menor propensão a comprar novamente, não redução medida de volume de compras. A fonte primária completa não foi localizada nesta checagem.
- **18%–50% de chamados:** os [materiais da Gorgias](https://www.gorgias.com/blog?9ad712ec_page=22&da8d3ae2_page=71) sustentam uma média de 18% para WISMO em sua base. O intervalo inteiro e o limite de 50% em pico não foram confirmados como resultado de uma única pesquisa nesta checagem. Não generalizar nem atribuir ao dataset da TransLog.

Usar pesquisas externas como motivação, com ano, população e fonte. A Silver não tem histórico de chamados, recompra ou tarifa de frete para demonstrar essas métricas do cliente fictício.

## Texto sugerido para Marco enviar ao grupo

> A divisão agente para atendimento + dashboard para gestão faz sentido. Eu manteria inteligência de rotas como extra após o MVP. Algumas colunas da imagem já existem na Silver e precisam de um único nome/regra. Precisamos preservar nulos de atraso, confirmar data de entrega real antes de derivá-la e tratar promessa irreal como hipótese, não causa comprovada. Recalculei por pedido avaliado na nossa Silver: Standard 39,75%, Second 79,84%, First 100%, Same Day 48,41%; total 57,31%, incluindo PROCESSING conforme a regra atual. Vamos fechar o denominador e usar nossos números. Para o extra, sugiro Dados/BI entregarem uma Gold por região/classe com amostra, pontualidade e P80 histórico; ouro/prata/bronze e um ou dois agentes ainda precisam de regra/escopo combinado.

Nenhuma mensagem foi enviada pelo assistente e nenhum componente do extra foi implementado.
