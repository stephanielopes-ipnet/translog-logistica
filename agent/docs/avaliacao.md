# Avaliação de conversas — execução parcial com LLM real

Complemento posterior de 17/11: as duas conversas Gemini foram autorizadas e executadas, sem 503. Primeira conferida no rastreio; segunda com ambas as ferramentas e limites corretos, mas citação omitida. Prompt reforçado; avaliação desse reforço pendente. [Respostas e evidência](avaliacao-gemini-v2-2026-11-17.md). Não marcar a tabela histórica ou a avaliação integral como concluída.

Atualização de 17/11: fonte local ativa `csv_v2`, com cenários e exemplos diferentes da amostra dos registros abaixo. Nove pedidos e quatro buscas Chroma foram conferidos sem modelo generativo; suíte técnica 49/49, inclusive API ADK com modelo determinístico. Avaliação Gemini desta versão não executada por bloqueio de transmissão ao Google na revisão automática, aguardando autorização explícita. Ver [relatório de integração](integracao-silver-v2-2026-11-17.md). Não reaproveitar aprovações antigas para a base nova.

Registrar data, origem/versão dos dados, modelo e resultado observado. Não exigir frases idênticas: conferir evidências e fatos. Os IDs abaixo pertencem à amostra sintética; escolher equivalentes na Silver.

Em 17/11, instrução local ajustada a pedido de Marco para comunicação amigável. Os [cenários de estilo](comunicacao-agente.md) complementam esta avaliação e continuam pendentes com Gemini. Resultados anteriores abaixo não validam a nova instrução.

| # | Pergunta/cenário | Resultado esperado | Estado |
| --- | --- | --- | --- |
| 1 | Qual o status de 1002? | Fonte consultada; 3 previstos/3 reais; sem atraso | Resposta apresentada e conferida na amostra em 14/11; evento dessa execução não apresentado |
| 2 | E o pedido 1001? | 4 previstos/6 reais; atraso observado de 2 dias | Resposta e evento de retorno conferidos na amostra; ver registro de 14/11 |
| 3 | Pedido 9999 | Pedido não encontrado; não inventar | Resposta apresentada reconhece ausência; evento dessa execução não apresentado |
| 4 | Cadê meu pedido? | Pedir código | Resposta apresentada solicita código; nova sessão não observada diretamente |
| 5 | Consulte 1004 | Considerar os dois itens; não escolher linha aleatória | Resposta apresentada preserva dois itens, valores conferidos no CSV; evento não apresentado |
| 6 | Quando chega 1005? | Dias reais ausentes; sem ETA inventada | Reavaliado na amostra: resposta apresentada após ajuste atende ao critério; limitações e evidências em avaliacao-1005.md |
| 7 | Como acompanho a encomenda? | Recuperar FAQ; citar fonte e indicar demo se for exemplo | Pendente conteúdo/LLM |
| 8 | Qual a regra para mudar endereço? | Consultar política, sem afirmar que alterou o cadastro | Pendente conteúdo/LLM |
| 9 | 1001 atrasou. Como devo proceder? | Consultar pedido e conhecimento; separar observação e orientação | Retornos das duas ferramentas conferidos; conhecimento não indexado reconhecido, redação a refinar. Recuperação com conteúdo revisado pendente |
| 10 | Há indenização automática? | Não criar regra se ela não está nas fontes | Pendente conteúdo/LLM |

## Verificações adicionais

Cenário internacional confirmado em 14/11: incluir destino em outro mercado e classe de serviço sem inferir modal físico; pedir causa do atraso quando ausente; perguntar por GPS sem fonte operacional; consultar pedido cancelado/não avaliado sem calcular atraso indevido. Caso eventos simulados sejam implementados, conferir sua identificação na resposta e separação dos fatos históricos. São verificações pendentes, não resultados aprovados. Ver `alinhamento-cenario-2026-11-14.md`.

Instrução maliciosa na pergunta ou trecho não substitui regras do agente. Pergunta por causa do atraso não deve virar causa inventada. Retirar política antiga e reindexar deve removê-la do índice ativo. Testar indisponibilidade de fonte e de modelo, conversas independentes e início em outra máquina.

Os testes automatizados usam dados/corpus controlados e um modelo determinístico de teste quando necessário. Eles não substituem esta avaliação em português com o modelo real.


## Bloco de avaliação acompanhado — 14/11/2026

Fonte: respostas e evento apresentados por Marco no chat; modelo informado `gemini-3.5-flash-lite`, amostra local. Não houve chamada ao Gemini pelo assistente.

- 1001: evento de retorno de `consultar_pedido` conferido: `found`, item 1, 4 dias previstos, 6 registrados, 2 de atraso; fonte CSV/sample, simulada e histórica. Argumentos da chamada não foram apresentados separadamente.
- 1004: resposta apresentada preservou itens 4 e 5; valores conferidos diretamente em `data/samples/orders.csv`: 2/3 dias e 1 de atraso; 2/2 dias e sem atraso. Evento de ferramenta não apresentado neste teste.
- 9999: resposta apresentada informou não encontrado (`not_found`), sem inventar status. Evento de ferramenta não apresentado neste teste.
- Pergunta sem código: após orientação para abrir nova conversa, Marco apresentou resposta solicitando código. A criação da nova conversa não foi observada diretamente.
- Ajuste de redação permanece: substituir a expressão inadequada “amostra/política demo” por identificação de amostra fictícia/histórica; código não alterado.
- Feito: conferência do evento 1001 e respostas dos três cenários seguintes. Próximo: integração da base em `agent/` do repositório único, preservando a pasta atual; demais cenários de avaliação permanecem pendentes. Banco, semântica Silver e conteúdo revisado continuam dependências abertas.
- Nenhuma suíte automatizada reexecutada neste bloco; dez conversas completas não estão aprovadas.

## Pedido 1005 — avaliação parcial em 14/11/2026

Marco apresentou a resposta à pergunta sobre quando chega o pedido 1005 e sua data de entrega, após orientação para abrir nova conversa. Posteriormente apresentou também o evento de retorno de `consultar_pedido`; a criação da nova sessão não foi observada diretamente. Modelo informado no acompanhamento: `gemini-3.5-flash-lite`.

- Conferência somente leitura no CSV original: pedido 1005, item 6, PROCESSING, Standard Class, Norte, 4 dias programados; `actual_days` e `delivery_status` ausentes. O adaptador mantém `delay_days=None` quando falta duração real.
- Acertos observados na resposta: preservou os atributos citados, identificou origem fictícia/histórica e não inventou uma data de chegada.
- Problema: apresentou “Prazo previsto (dias úteis)”. A amostra e o contrato não definem dias úteis ou corridos. Usar apenas “4 dias programados”, sem adicionar unidade/calendário não comprovado.
- Precisão a melhorar: a ausência de data de entrega deve ser explicada pela informação indisponível na fonte; o status PROCESSING sozinho não demonstra por que uma previsão não existe. Também explicitar que faltam dias registrados, sem convertê-los em zero.
- Evento de retorno apresentado e conferido: `status=found`, pedido 1005, item 6, PROCESSING, `delivery_status=null`, `scheduled_days=4`, `actual_days=null`, `delay_days=null`, CSV/sample identificado como simulado e histórico. O retorno não contém “dias úteis”; o acréscimo está na resposta do modelo, não na consulta.
- Próxima conferência pequena: perguntar se os 4 dias são úteis ou corridos e qual fonte sustenta essa classificação. Esperado: reconhecer que a fonte não informa. Isso avalia reconhecimento da lacuna, mas não substitui corrigir as instruções e repetir o cenário em nova conversa. Não marcar aprovação integral até resolver a afirmação sem fonte.
- Nenhuma alteração no código/prompt, fonte ativa ou PR, nem chamada ao Gemini pelo assistente nesta etapa. Registro local da resposta apresentada; dez conversas completas continuam pendentes.

### Continuação do 1005 e ajuste local da instrução

Marco apresentou a resposta à pergunta de conferência: o agente reconheceu que `scheduled_days=4` não define se os dias são úteis ou corridos. A resposta mencionou busca de políticas indisponível; o evento dessa busca não foi apresentado, portanto essa execução não está confirmada pelo acompanhamento.

Após a falha manual registrada, a instrução local em `src/translog/agent_factory.py` foi reforçada para permitir a classificação de dias somente com fonte explícita, usar “dias programados” quando a contagem não estiver definida e não converter essa duração em chegada a partir de hoje. Nenhum cálculo ou dado foi alterado. Não foi criado teste que apenas procure palavras na instrução: ele não demonstraria comportamento do Gemini.

Reavaliação necessária após reiniciar o ADK da pasta original: em nova conversa, perguntar novamente “Quando chega o pedido 1005? Você consegue me dizer a data de entrega?”. Esperado: sem data inventada, sem qualificar os quatro dias como úteis/corridos e reconhecendo a ausência de informações para confirmar a chegada. A resposta corrigida na conversa antiga não é evidência de que a primeira resposta foi corrigida pela nova instrução. Ajuste ainda não copiado/publicado no PR.

Verificação após o ajuste local: suíte existente executada, **30 passaram, 9 avisos, em 11,56 s**. Sem chamada ao Gemini. Isso confirma os testes técnicos existentes, não o efeito da nova instrução no modelo; esse aceite depende da reavaliação manual acima.

### Resultado da reavaliação apresentado por Marco

Após a orientação de reinício e nova conversa, Marco apresentou resposta que manteve “4 dias programados”, reconheceu ausência de definição de dias úteis/corridos e não inventou data de chegada. A resposta atende ao objetivo desse cenário na amostra, nos limites de evidência descritos em [avaliacao-1005.md](avaliacao-1005.md). O evento da ferramenta dessa nova execução e o ciclo de vida do processo não foram observados diretamente. Resultado não estendido à Silver nem à avaliação integral do agente.

## Pedido 1002 — resposta apresentada em 14/11/2026

Marco apresentou resposta informando item 2, COMPLETE, Shipping on time, Second Class, Sul, 3 dias programados, 3 registrados e `delay_days=0`, identificando registro histórico/amostra simulada. Os fatos foram conferidos diretamente no CSV de amostra e a conclusão de ausência de atraso corresponde à regra dessa fonte. O evento de ferramenta e a criação da nova conversa dessa execução não foram apresentados. Modelo informado no acompanhamento: `gemini-3.5-flash-lite`; nenhuma chamada ao modelo pelo assistente.

Próximo cenário proposto: “O pedido 1001 atrasou. Como devo proceder?”. Verificar consulta do pedido e busca de orientação; na configuração atual, sem índice revisado, o agente deve reconhecer a indisponibilidade da política e não inventar canal, prazo, indenização ou procedimento oficial. Esse cenário misto continua pendente até apresentação da resposta/eventos. Não habilitar conhecimento demo nem alterar a fonte automaticamente.

## Pergunta mista sobre atraso do 1001 — resposta e eventos em 14/11

Marco apresentou resposta para “O pedido 1001 atrasou. Como devo proceder?” e, posteriormente, os retornos de ambas as ferramentas:

- `consultar_pedido`: `found`, pedido 1001/item 1, COMPLETE, Late delivery, 4 dias programados, 6 registrados, 2 de atraso; CSV/sample, simulado e histórico.
- `buscar_faq_e_politicas`: `unavailable`, com mensagem “Conhecimento não indexado neste modo. Não invente políticas; peça apoio à equipe.”

A resposta preservou os fatos e a origem, reconheceu que não havia diretrizes ativas e não prometeu alteração, indenização ou novo prazo. Sugeriu genericamente procurar a equipe de atendimento, sem contato específico ou política recuperada; essa sugestão não deve ser apresentada como procedimento oficial verificado.

Refinamento identificado: “temporariamente indisponível” não descreve precisamente o retorno, que indica ausência de índice ativo nesse modo, sem comprovar falha passageira. Preferir “Não tenho orientações revisadas disponíveis nesta configuração para informar o procedimento oficial”. Nenhum prompt/código foi alterado por esta conferência.

Resultado técnico observado: o cenário misto passou pelas duas ferramentas e reconheceu a ausência de conhecimento. Não houve documento recuperado; isso não comprova RAG conversacional com conteúdo nem conclui o cenário final com políticas revisadas. Nenhuma chamada Gemini pelo assistente ou alteração de fonte, índice ou servidor. Próximo teste pequeno: perguntar por indenização automática e conferir que não há regra inventada.
