# Contrato de consulta — v0.1 proposto

Correção posterior de 17/11: fonte do projeto já alinhada em 16/11 — tabelas `consumo_*` no Databricks, com CSVs exportados como alternativa local e sem banco próprio. O agente de testes usa `csv_v2`. Conexão SQL direta do agente não implementada é uma limitação técnica; as notas anteriores de decisão de banco pendente não refletem o alinhamento atual. FAQ fechada e conciliada em `faq-v2-conciliada.md`; teste em http://127.0.0.1:8003 .

## Contrato ativo local v0.2 — consumo Silver v2, 17/11

Os três CSVs enviados por Mateus foram recebidos e integrados no backend explícito `csv_v2`. O [contrato e relatório v2](integracao-silver-v2-2026-11-17.md) definem pedidos, itens e eventos, retorno com `order`/`items`/`events`, preservação de diferenças negativas e nulos, separação entre despacho e entrega e identificação de histórico/simulação. Marco confirmou que 4/2/1 dias são prazos de despacho. Não há mudança do nome ou argumento da ferramenta nem das rotas HTTP. Banco/SQL continuam pendentes. As seções v0.1 abaixo documentam o adaptador anterior, ainda disponível como `csv`, e as pendências históricas; não descrevem a fonte local ativa após esta atualização.

A Silver foi recebida em **13/11**; a adaptação semântica ainda está pendente. A amostra atual é inteiramente sintética. O banco definitivo não foi escolhido.

## Preparação para a Gold — 17/11

Marco informou que Mateus de Dados enviará a Gold e pediu os campos prioritários para tratamento. A [solicitação detalhada](solicitacao-gold-mateus-2026-11-17.md) separa consulta por pedido/item, eventos simulados e metadados de validação. Trata-se de uma solicitação, sem schema aprovado, arquivo recebido ou mudança da fonte ativa. O contrato reduzido abaixo continua sendo o implementado; novos campos e regras de atraso/eventos exigem adaptação e testes.

## Retorno parcial de Dados em 14/11

Mateus de Dados (sem H, conforme correção de Marco) explicou que atraso vazio ocorre em pedidos com pagamento não processado ou cancelados pelo cliente/por suspeita de fraude. Manter ausência como atraso não avaliado, sem convertê-la em zero ou recalcular automaticamente. O motivo individual depende do status e do mapeamento confirmado; nulo sozinho não identifica fraude, cancelamento ou situação de pagamento.

A exportação recebida era a atual no momento da resposta, mas Mateus anunciou atualização para 14/11 e novas colunas na base final. A atualização ainda não foi recebida neste acompanhamento. Dicionário completo, novas colunas, regras por código de status, banco e fonte final permanecem a conferir. Ele ofereceu uma chamada após enviar a base. Fonte e limites em [alinhamento-dados-2026-11-14.md](alinhamento-dados-2026-11-14.md).

## Validação pendente da Silver internacional

Complemento de 15/11: orientação atribuída a Othon requer investigar a definição e justificar a interpretação/simulação se a dúvida continuar; não é confirmação de despacho. Foi localizado o dicionário breve dos autores no Mendeley, mas a descrição do intervalo real de envio não explicita o evento final. Manter a ambiguidade registrada e distinguir hipótese operacional de dado observado. Ver [interpretacao-dataco-fontes-2026-11-15.md](interpretacao-dataco-fontes-2026-11-15.md).

O contrato abaixo descreve a base atual de desenvolvimento, não uma equivalência já aprovada com a Silver. Na fonte recebida, `dias_atraso` admite negativos (adiantamento) e fica vazio em status não avaliados/cancelados mesmo com os dois dias preenchidos. A fórmula atual não deve ser aplicada indiscriminadamente a esses registros. Confirmar a elegibilidade e representação final com Dados antes de alterar o adaptador.

`origem_cliente_pais` não comprova sede ou ponto de despacho. `modo_envio` contém classes de serviço; não deduzir caminhão/avião/navio. Os destinos permitem análise geográfica, sem comprovar trajeto ou GPS. Conferir a última exportação após a discussão de retirada das coordenadas na reunião de 13/11.

Eventos sintéticos eventualmente adicionados deverão ter fonte explícita e ficar separados da Silver histórica. Nenhum contrato de eventos foi implementado nesta revisão. Ver [alinhamento de 14/11](alinhamento-cenario-2026-11-14.md).

## CSV de desenvolvimento

UTF-8 com cabeçalho e vírgula por padrão. Encoding e separador são configuráveis. `TRANSLOG_COLUMN_MAP` aponta para JSON com nomes canônicos como chaves e nomes da Silver como valores; não adivinhar mapeamentos. Exemplo: `{"order_id":"Order Id","order_item_id":"Order Item Id"}` — confirmar no arquivo real antes de usar.

| Campo | Tipo e regra |
| --- | --- |
| order_id | Texto obrigatório; preservar zeros à esquerda |
| order_item_id | Texto obrigatório; único dentro do pedido |
| order_status | Texto ou nulo |
| delivery_status | Texto ou nulo; preservar o significado original |
| scheduled_days | Inteiro não negativo ou nulo |
| actual_days | Inteiro não negativo ou nulo |
| shipping_mode | Texto ou nulo |
| destination_region | Texto ou nulo |

Grão: um item por linha. Chave composta duplicada é erro de fonte; vários itens do mesmo pedido são válidos. `delay_days` é derivado, nunca deduzido de valor ausente. Campos não listados, como nome, endereço e e-mail, não entram no resultado da ferramenta.

## Ferramenta

`consultar_pedido(order_id: str) -> dict`

`status`: `found`, `not_found`, `invalid_input` ou `unavailable`. `items` contém todos os registros do pedido; `source` informa origem, se é simulado e momento de geração do snapshot. Esse momento não é localização/atualização operacional do veículo.

Um arquivo ausente ou inválido significa indisponibilidade, não pedido inexistente. A consulta não altera a fonte. CSV é desenvolvimento, não SQL. Ao selecionar `sql_pending`, a ferramenta informa a pendência sem usar uma amostra escondida.

## Decisão SQL pendente

Grupo deve definir banco, servidor/porta, nome da base, tabela/view, carga e responsável, campos, atualização e usuário de leitura. Adaptador deverá manter o resultado desta ferramenta e usar consultas parametrizadas. Não criar banco definitivo por suposição.
