# Avaliação manual: prazo do pedido 1005

Data: 14/11/2026. Modelo informado por Marco: `gemini-3.5-flash-lite`. Fonte dos resultados de linguagem: respostas e evento apresentados por Marco, sem inferência executada pelo assistente.

## Cenário e fonte

Pergunta: “Quando chega o pedido 1005? Você consegue me dizer a data de entrega?”

Amostra fictícia/histórica `data/samples/orders.csv`: pedido 1005, item 6, PROCESSING, Standard Class, destino Norte e 4 dias programados. Dias registrados, atraso e status de entrega ausentes. Nenhuma definição de dias úteis ou corridos.

## Falha observada e diagnóstico

A primeira resposta não inventou uma data de chegada, mas escreveu “Prazo previsto (dias úteis): 4 dias”. O retorno de `consultar_pedido` apresentado por Marco confirmou `scheduled_days=4`, `actual_days=null`, `delay_days=null` e `delivery_status=null`, com origem CSV/sample simulada e histórica. Não havia classificação do calendário na ferramenta; a resposta acrescentou esse detalhe sem fonte.

Questionado na mesma conversa, o agente reconheceu que não poderia confirmar dias úteis ou corridos. Isso demonstra correção após questionamento, mas não valida a primeira resposta. A menção a busca de políticas indisponível nessa resposta não teve evento apresentado para conferência.

## Ajuste da instrução

Em `src/translog/agent_factory.py`, foram acrescentadas duas instruções:

```text
Só classifique dias como úteis ou corridos se uma fonte consultada declarar explicitamente essa contagem.
Sem essa definição, use apenas "dias programados". Não converta essa duração em data de chegada a partir de hoje.
```

O ajuste não muda fonte, cálculo de atraso, API ou regras de negócio. Ele orienta a resposta a reconhecer uma definição ausente. Não foi criado teste que procure palavras no prompt como se isso comprovasse comportamento do modelo.

## Reavaliação manual

Após a orientação para reiniciar o ADK e abrir nova conversa, Marco apresentou nova resposta à pergunta inicial. Trecho observado:

> O registro indica **4 dias programados**. Como a fonte não especifica se a contagem se refere a dias úteis ou corridos, não é possível converter esse período em uma data exata de chegada.

A resposta também preservou item, status, classe e região, identificou a amostra como histórica/fictícia e não prometeu entrega ao vivo ou garantida. A ordem de reinício/nova sessão foi orientada; o ciclo de vida do processo e o evento da ferramenta dessa nova execução não foram observados diretamente pelo assistente.

**Resultado:** a resposta apresentada atende aos critérios deste cenário quanto à contagem de dias e ausência de data inventada. Isso não comprova eliminação definitiva da falha em qualquer conversa. O status PROCESSING continua sendo um registro histórico da amostra, não uma confirmação da operação atual.

## Testes e limites

A suíte técnica existente após o ajuste na pasta original teve **30 testes aprovados, 9 avisos, em 11,56 s**, sem chamadas ao Gemini. Os testes usam dados controlados; quando há modelo, ele é determinístico. O efeito da instrução no Gemini é evidenciado pela reavaliação manual acima, não pela suíte determinística.

Após levar o mesmo ajuste para `agent/`, a suíte foi executada também na cópia integrada: **30 passaram, 9 avisos, em 10,50 s**, com o Python já existente da pasta original e `src` do destino priorizado. Isso ainda não equivale a uma instalação independente na máquina de Matheus FullStack.

Este resultado não utiliza a Silver de Mateus de Dados, não valida políticas oficiais e não conclui as dez conversas de avaliação nem a integração com o portal.
