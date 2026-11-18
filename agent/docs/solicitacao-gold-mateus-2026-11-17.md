# Informações da Gold para o agente — solicitação a Mateus de Dados

17/11/2026. Marco informou que Mateus de Dados enviará a Gold e pediu uma lista para orientar o tratamento. Este documento é uma solicitação de consumo da IA, não um schema acordado nem confirmação de recebimento. O banco definitivo continua pendente. Nenhuma mensagem foi enviada pelo assistente.

O agente precisa consultar um pedido específico e seus itens. A entrega deve preservar esse detalhe, mesmo que a Gold também tenha tabelas agregadas para BI. Os nomes abaixo são referências da Silver recebida; Mateus pode usar outros nomes, acompanhados do mapeamento explícito. Campos adicionais exigirão adaptação da ferramenta antes de aparecerem nas respostas.

## 1. Prioridade máxima: consulta de pedido

| Informação | Referência na Silver / definição a acompanhar |
| --- | --- |
| Código do pedido e do item | `id_pedido`, `id_item_pedido`; preservar como texto e zeros à esquerda. Uma linha por item, sem duplicar a chave composta. |
| Status do pedido | `status_pedido`; dicionário de códigos, descrição em português e significado operacional. Status do pedido não é automaticamente status de entrega. |
| Situação da entrega/rastreio | `status_entrega_pt`, `situacao_rastreio`; explicar a derivação e distinguir observação histórica de cenário simulado. |
| Datas do pedido e envio/despacho | `data_pedido`, `data_envio`; indicar exatamente o evento representado, formato e fuso ou ausência de fuso conhecido. |
| Duração programada e registrada | `dias_envio_programado`, `dias_envio_real`; definir início/fim do intervalo, unidade e calendário de dias úteis/corridos, se conhecido. Envio não comprova chegada ao cliente. |
| Avaliação de atraso | `dias_atraso`, `flag_atrasado`, se mantidos; documentar elegibilidade por status, fórmula e significado de negativos, zero e nulo. Preservar "não avaliado", sem preencher com zero. |
| Classe de serviço | `modo_envio`, com descrição; Standard/Second/First/Same Day não definem caminhão, avião ou navio. |
| Destino | `destino_cidade`, `destino_estado`, `destino_pais`, `destino_regiao`, `mercado_logistico`; grafias e acentuação normalizadas, sem endereço pessoal. |
| Procedência e versão | Fonte histórica ou sintética, versão da base e data da exportação, em colunas ou metadados acompanhantes. Data do arquivo não é data do último evento. |

Se `data_prevista_entrega` for fornecida, indicar fórmula, marco inicial, calendário e se é previsão derivada ou simulada. Só expor como previsão de entrega após validar essa interpretação; não tratá-la como data real. Data de entrega efetiva e causa do atraso só entram quando houver registro com significado comprovado, ou como simulação explicitamente identificada.

## 2. Prioridade para o rastreio simulado: eventos e trechos

Mateus relatou trabalhar com eventos e dois cenários. Pedir a tabela e a explicação dos cenários. Estes são campos propostos para conferência, não nomes ou regras aprovados:

- Chave do evento e ligação explícita ao pedido, item e/ou entrega. Se um pedido tiver várias entregas, explicar a quais itens cada uma corresponde.
- Ordem dos trechos/eventos e tipo de marco: despacho, chegada a hub, saída, entrega etc., conforme o cenário adotado.
- Local do evento: cidade/país e hub, quando disponíveis. Distinguir local do cliente, origem de despacho e local do evento.
- Data/hora prevista e ocorrida em campos distintos, fuso e regra para ausência. Evento futuro não comprova onde o pedido está.
- Identificação de simulação, cenário, origem/versão e instante de referência da simulação. Evento ocorrido apenas no cenário continua sendo simulado.
- Critério para selecionar o último evento ocorrido até o instante de referência; não escolher a última linha ou maior data futura como posição atual.
- Modal físico somente com definição e regra documentadas; se atribuído pela simulação, identificar essa origem.

Tabela separada de eventos evita multiplicar itens nos joins. Definir a cardinalidade das relações e não somar valores nem contar pedidos novamente para cada evento. Manter história original separada dos eventos sintéticos e dos KPIs históricos. O produto atual não oferece GPS ao vivo; não solicitar coordenadas de veículos como requisito.

## 3. Informações complementares

Nome do produto e quantidade (`nome_produto`, `quantidade_item`) ajudam a explicar pedidos com vários itens, mas não bloqueiam a consulta básica. Valores e moeda só são úteis se o atendimento incluir perguntas financeiras. Margens, lucro, perfil de cliente, P80 e classificação ouro/prata/bronze não são necessários ao escopo atual do agente. Não solicitar nome, CPF, telefone, e-mail ou endereço completo de clientes para enviar ao modelo.

FAQ, políticas, canais, SLA, indenização e procedimentos dependem dos textos revisados coordenados por Stephanie. Não inventá-los no tratamento da Gold nem deduzi-los de atrasos históricos. Pedidos/eventos ficam na consulta estruturada; Chroma continua destinado a FAQ/políticas.

## 4. O que acompanhar a entrega

- Dicionário com nome, tipo, descrição, exemplos e significado de ausências; mapa de status e fórmulas dos campos derivados.
- Granularidade, chaves, relações, contagens de pedidos/itens/eventos, regras de duplicidade e versão da exportação.
- Explicação dos dois cenários, premissas e distinção entre histórico e simulação.
- Formato e modo de acesso; se CSV, encoding, separador e representação de nulos/datas. A escolha do banco continua com o grupo.
- Casos conferíveis com IDs e resultados esperados: atrasado, no prazo, vários itens, processamento com informação ausente e cancelado/não avaliado; adiantado se houver diferença negativa e exemplos dos cenários simulados. Não criar esses casos artificialmente na história original.

O adaptador atual só lê o contrato reduzido de desenvolvimento e recalcula atraso não negativo. Não basta apontá-lo para a Gold ou renomear colunas: validar regras e adaptar atraso/eventos antes de ativá-la.

## Mensagem pronta para encaminhar

> Mateus, para o agente, o mais importante é a Gold manter o detalhe por pedido e item, além dos agregados do BI. Preciso de código do pedido/item, status do pedido e da entrega com significado dos códigos, datas do pedido/envio, dias programados e registrados, atraso e regra de quando ele é avaliado, classe de serviço e destino (cidade, estado, país e região). Se houver previsão de entrega, preciso da fórmula e do significado dela. É importante preservar os nulos, sem transformar atraso não avaliado em zero.
>
> Para os eventos simulados, preciso da ligação com pedido/item/entrega, sequência dos trechos, local, datas previstas e ocorridas separadas, identificação de simulação/cenário e data de referência. Me explica também os dois cenários e como identificar o último evento ocorrido. Se houver modal, preciso da regra explícita, sem deduzir pela classe de serviço.
>
> Pode enviar junto o dicionário, fórmulas, versão/formato da exportação e alguns códigos de exemplo com resultado esperado (atrasado, no prazo, vários itens, processamento e cancelado/não avaliado)? Não preciso de dados pessoais de clientes. Os nomes das colunas podem ser os que vocês adotarem, com o mapeamento documentado. FAQ e políticas sigo alinhando com a Stephanie.
