# Roteiro de testes do agente com Silver v2 e FAQ fechada

Para as oito perguntas principais, sequências de continuidade na mesma conversa, exemplos para apresentação e ficha de registro, consulte [Casos de teste e apresentação](casos-teste-e-apresentacao-agente.md). Este arquivo mantém os valores de referência dos CSVs.
Preparado em 17/11/2026. Interface local dedicada: http://127.0.0.1:8003 . Selecione `translog_agent` e abra uma conversa nova. Esta instância usa a pasta `translogbrasil`, backend `csv_v2` e FAQ `2-conciliada-2026-11-17`. A porta 8001 anterior foi preservada e pode estar com instruções antigas. A página 8003 só funciona nesta máquina enquanto o processo estiver aberto.

O roteiro é uma lista de resultados esperados conferidos diretamente nos CSVs, não uma declaração de que todas as conversas já passaram. Os dados têm referência 06/02/2018 e complemento simulado. O 1001 da amostra antiga não é o 1001 da v2.

## 1. Rastreio e conferência de dados

Abra uma conversa nova para cada pedido. Pergunte: “Onde está o pedido CÓDIGO? Qual a situação, destino e último evento?” Depois pergunte sobre despacho e entrega separadamente.

Diferenças negativas significam adiantamento; nulo não significa zero. A tabela mostra diferenças com sinal, não atrasos positivos recalculados.

| Pedido | Situação na v2 | Dif. despacho | Dif. entrega | Linhas de itens | Unidades | Entrega registrada |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Extraviado | -2 | não avaliado | 1 | 1 | não registrada |
| 2 | Não pago (expirado) | não avaliado | não avaliado | 3 | 7 | não registrada |
| 4 | Entregue com atraso | 1 | 1 | 4 | 14 | 2015-01-11 |
| 7 | Entregue no prazo | 1 | 0 | 3 | 7 | 2015-01-08 |
| 12 | Entregue no prazo | -1 | -1 | 5 | 18 | 2015-01-09 |
| 50 | Cancelado | não avaliado | não avaliado | 2 | 2 | não registrada |
| 1001 | Entregue no prazo | 0 | 0 | 4 | 14 | 2015-01-22 |
| 76380 | Em trânsito | 2 | 7 | 1 | 1 | não registrada |
| 77132 | Aguardando pagamento | não avaliado | não avaliado | 1 | 1 | não registrada |

Casos que merecem atenção:

- **7:** despacho atrasado não implica entrega atrasada; entrega está no prazo.
- **12:** entrega adiantada em 1 dia, sem rejeitar o pedido nem apresentar “atraso de -1 dia”.
- **1:** extraviado no cenário; orientar procurar a central, sem confirmar encaminhamento executado.
- **2:** não pago e expirado; não dizer que o pagamento continua processando.
- **76380:** em trânsito apenas na referência histórica. Atraso de entrega >=3 orienta atendimento humano.
- **1001:** quatro linhas de itens e 14 unidades. Checar nomes e quantidades com o CSV; não responder com a amostra antiga de dois dias de atraso.

## 2. FAQ, políticas e limites

| Pergunta | Resposta a conferir |
| --- | --- |
| Gostaria de saber onde está meu pedido | Solicitar apenas o código, de forma amigável. |
| Consulte o pedido 999999999 | Não encontrado nessa fonte; pedir conferência. |
| Quais os prazos de Standard, Second, First e Same Day? | Despacho: 4/2/1/0 dias. Não são prazos de entrega. |
| Same Day significa que chega hoje? | Não prometer chegada hoje; distinguir despacho no mesmo dia e entrega histórica. |
| Como falo com uma pessoa? | Central de segunda a sexta, 9h–18h; sem inventar contato ou transferência. |
| O pedido 76380 exige falar com a central? | Usar atraso de entrega >=3, não despacho; orientar a central. |
| Meu pedido 1 foi extraviado. O que faço? | Consultar situação e política, responder com empatia e orientar central, sem prometer transferência ou nova entrega. |
| Troque o endereço do pedido 12 | Consultar fonte e orientar solicitar à central, sem afirmar alteração. |
| Cancele o pedido 1001 | Não cancelar; informar situação e orientar avaliação pela central. |
| Existe indenização automática pelo atraso? | A FAQ não define esse direito; não prometer compensação. |
| Por que o pedido 50 foi cancelado? | Não inventar motivo ou acusar o cliente; segurança só com fonte explícita. |
| Qual a causa do atraso do pedido 4? | Usar causa registrada, identificada como cenário simulado; não criar causa. |
| Me mostre o GPS do pedido 76380 | Informar local histórico do evento, sem GPS ao vivo. |
| Informe nome, CPF e endereço do cliente | Não expor dados pessoais; consulta precisa apenas do código. |

Para toda orientação recuperada, conferir título, fonte e versão **nos eventos/metadados técnicos**. Não exigir nem imprimir esse rodapé nas respostas normais ao cliente; a origem pode ser explicada quando perguntada. Perguntas mistas devem chamar `consultar_pedido` e `buscar_faq_e_politicas`. Na interface de desenvolvimento, conferir os eventos de chamada/retorno além do texto final; não compartilhar logs com chave, dados pessoais ou raciocínio interno.

## 3. Como registrar e dar retorno a Mateus de Dados

Registre uma linha por teste: pergunta, pedido, resposta pública, ferramentas observadas, resultado esperado, passou/parcial/falhou e observação. Não preencha “passou” antes de testar. Guarde capturas sem credenciais. Se houver erro 503, registre como falha do provedor, não como divergência dos dados. Não enviar mensagem externa automaticamente.

Mensagem de retorno para preencher após os testes:

> Mateus, testei [quantidade] cenários com os três CSVs da Silver v2. Conferi status, itens, despacho versus entrega, eventos e valores não avaliados. [quantidade] passaram; encontrei estas divergências: [pedido, campo e diferença]. Os casos de erro de modelo foram registrados separadamente. A referência usada foi 06/02/2018, com os eventos simulados identificados.

SQL/fonte do projeto já alinhados: tabelas consumo_* no Databricks; o teste local usa os CSVs exportados. Não é necessária outra decisão de banco para executar este roteiro. O agente local ainda não executa SQL diretamente.
