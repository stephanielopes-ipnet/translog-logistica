# Revisão da Silver de pedidos e rastreio — 14/11/2026

Preparado para Marco compilar e encaminhar ao **Matheus de Dados**. Revisão somente leitura: o CSV não foi corrigido nem substituído. A informação de sede em Porto Rico foi fornecida por Matheus de Dados ao grupo, conforme esclarecimento de Marco; a ausência de um campo de sede no CSV não é defeito da base.

## Parecer

**A estrutura está consistente e permite continuar o desenvolvimento. Antes de concluir a integração com IA, mapa e BI, corrigir os caracteres geográficos danificados e fechar os contratos semânticos de origem, datas e status.** Há coordenadas suspeitas a retirar ou validar e diferenças monetárias pequenas cuja regra de arredondamento precisa ser documentada.

As 180.519 linhas e as 41 colunas foram percorridas. Isso é revisão completa desta exportação, não certificação de todas as transformações: não foram disponibilizados o Bronze original, o notebook de transformação nem o dicionário definitivo. Não é possível distinguir em todos os casos um problema da fonte de uma decisão de limpeza sem esses materiais.

## Identificação e método

| Item | Evidência |
| --- | --- |
| Arquivo | `silver_pedidos_rastreio.csv` recebido em 13/11 |
| Local auditado | `data/silver/silver_pedidos_rastreio.csv` |
| Tamanho | 162.957.607 bytes |
| SHA-256 | `133b31ddcccf7358b00870faa1e89b99a9fdba88e6ae83a85bdd0f5fd55d409c` |
| Formato | CSV com vírgula, leitura completa `utf-8-sig`, 41 cabeçalhos distintos |
| Grão | Item de pedido, chave `(id_pedido, id_item_pedido)` |
| Universo | 180.519 itens, 65.752 pedidos, 20.652 clientes identificados por código, 118 produtos |
| Múltiplos itens | 45.902 pedidos; máximo de cinco itens por pedido |
| Ferramentas | Python local/stdlib: parser CSV, Decimal, datetime, contagens e agrupamentos |
| Limites | Sem geocodificação externa, sem reconstrução do pipeline e sem chamadas ao LLM |

Exemplos usam pedido/item para localização. As contagens de itens não devem ser tratadas como contagens de pedidos. Tolerâncias monetárias de 0,01 e intervalos de arredondamento de 0,005 são diagnósticos explícitos desta auditoria, não regras de negócio aprovadas.

## O que passou nas verificações

- Nenhum registro com quantidade inesperada de campos, cabeçalho duplicado, chave composta repetida ou linha inteira duplicada detectado.
- IDs de pedido/item/cliente/produto completos e compatíveis com os identificadores aceitos pela consulta atual. `id_item_pedido` também é único globalmente nesta versão.
- Somente `dias_atraso` e `flag_atrasado` têm vazios: 79.510 em cada coluna, nas mesmas linhas e nos grupos excluídos da avaliação observada. As outras 39 colunas estão preenchidas.
- Nenhum valor numérico não finito/inválido detectado nas colunas numéricas, nem espaços externos ou caractere de substituição Unicode U+FFFD nas 41 colunas. Isso não exclui outros problemas de texto: ver R1.
- Datas parseáveis e completas, sem envio anterior ao pedido. Os dias programados/reais são inteiros não negativos.
- Zero divergências dos 23 atributos de pedido comparados entre seus itens: identificação do cliente, datas, modalidade, status, dias, geografia, pagamento e derivados de rastreio.
- Cada produto mantém o mesmo nome, categoria, departamento e preço nas suas ocorrências; nenhum nome de produto está associado a IDs diferentes.
- `valor_bruto_venda = quantidade_item × preco_unitario` exatamente nos 180.519 itens.
- `lucro_total_pedido` confere exatamente com a soma de `lucro_item` em cada um dos 65.752 pedidos.
- Nas 101.009 linhas avaliadas, atraso, flag, classificação e janela são internamente coerentes; nenhuma exceção às regras observadas foi encontrada.
- O texto derivado de rastreio corresponde aos IDs, situação, status, modalidade, rota e dias da linha. Os riscos são de interpretação, não de troca de pedido dentro desse texto.

## Lista de ajustes e confirmações

**Prioridades recomendadas:** P1 antes de apresentar respostas/indicadores como definitivos; P2 antes do fechamento da Gold e da demonstração. Não são mudanças de prazo do grupo.

| ID | Natureza | Prioridade | Ação recomendada |
| --- | --- | --- | --- |
| R1 | Dano de texto verificável + nomes a recuperar | P2 | Recuperar grafia de cidades e regenerar rota/resumo derivados |
| R2 | Triagem de coordenadas e definição de origem | P1 para mapa/rota | Retirar coordenadas conforme discutido ou validar e documentar o que representam |
| R3 | Regra derivada a confirmar | P1 | Aprovar tabela de status e elegibilidade do atraso, inclusive fraude suspeita |
| R4 | Definição temporal a confirmar | P1 para prazo/SLA | Documentar dias de calendário, Same Day, precisão da previsão e significado de data_envio |
| R5 | Arredondamento observável, sem erro material comprovado | P2 | Definir precisão e ordem dos cálculos monetários |
| R6 | Risco de dupla contagem, não erro do total | P1 para BI | Agregar lucro na granularidade correta e documentar unidade/moeda/margem |
| R7 | Classificação de produto a confirmar | P2 | Revisar a categoria Electronics e sua hierarquia, preservando o original |
| R8 | Histórico e texto para IA | P1 para atendimento | Identificar snapshot histórico e ajustar texto que sugere trânsito ocorrido em pedidos não liberados |

### R1 — Caracteres danificados em cidades

Encontrados **130 itens, 38 pedidos e seis grafias com `?`** em `destino_cidade`: `Aew?l-li`, `Bra?ov`, `Cox\u0092s B?z?r`, `Gy?r`, `Kahramanmara?` e `Klaip?da`. Desses 130 itens, sete também contêm o caractere de controle **U+0092** no nome `Cox\u0092s B?z?r`.

O controle inválido aparece nas mesmas sete linhas em `destino_cidade`, `rota_logistica` e `resumo_rastreio_rag`; não são 21 itens diferentes. Exemplos: pedido/item `28324/70867` e `28323/70863`. Outro exemplo com `?`: `41990/104822`, cidade `Bra?ov`.

**Ajuste:** recuperar a grafia a partir do Bronze/fonte ou de um mapeamento explícito revisado. Remover controles inadequados sem apagar informação útil. Depois regenerar rota e resumo. Não substituir `?` em massa por um acento escolhido por adivinhação. A leitura em UTF-8 funciona; o dano pode ter ocorrido em etapa anterior.

**Aceite:** nenhuma cidade com caractere de controle e as seis grafias tratadas ou marcadas como não recuperáveis, com origem da correção registrada.

### R2 — Coordenadas e origem logística

Todas as coordenadas são numéricas e estão nos limites globais de latitude/longitude, mas isso não garante localização correta. Uma triagem retangular ampla sinalizou **825 itens / 290 pedidos / 80 códigos de cliente / 46 pares de coordenadas** fora da faixa do país associado:

- Porto Rico: 598 itens fora de latitude [17, 19] e longitude [-68, -65].
- Estados Unidos: 227 itens fora da faixa ampla de latitude [18, 72] e longitude [-180, -65].

Essas faixas servem para **triagem**, não são polígonos oficiais nem geocodificação. Os 825 são candidatos a revisão, não uma contagem geográfica definitiva de erros.

Exemplo `4451/11139`: `origem_cliente_pais=Porto Rico`, cidade `San Sebastian`, coordenadas `29.93087578, -81.33435059`, fora da faixa ampla usada para Porto Rico. Exemplo `10748/26897`: país Estados Unidos, longitude `-12.25018311`.

O campo `rota_logistica` reproduz, em todas as linhas, o formato **estado do cliente → região do destino (cidade - estado)**. Exemplo `18/55`: `Flórida -> América Central (San Miguelito - Panamá)`. É texto construído a partir de colunas; não comprova percurso operacional calculado.

**Ajuste:** confirmar se os campos `origem_cliente_*` representam cliente, loja, instalação de despacho ou uma origem simulada. A sede em Porto Rico pode constar como contexto informado por Dados; isso não transforma automaticamente cada endereço de cliente em origem de remessa. Se a decisão foi excluir coordenadas, fornecer a exportação atualizada. Não usar esses pontos como GPS.

**Aceite:** origem definida no dicionário e coordenadas retiradas, validadas ou explicitamente isoladas do uso operacional. Nenhuma correção geográfica automática foi feita nesta revisão.

### R3 — Status e elegibilidade do atraso

As regras abaixo foram reconstruídas por comparação completa; são **regras observadas**, não prova de que a interpretação operacional está correta:

| status_pedido | situacao_rastreio | Itens | Pedidos | Avalia atraso? |
| --- | --- | ---: | ---: | --- |
| CLOSED | Entregue | 19.616 | 7.249 | Sim |
| COMPLETE | Entregue | 59.491 | 21.716 | Sim |
| PROCESSING | Em Trânsito | 21.902 | 7.901 | Sim |
| ON_HOLD | Aguardando Liberação | 9.804 | 3.624 | Não |
| PAYMENT_REVIEW | Aguardando Liberação | 1.893 | 704 | Não |
| PENDING | Aguardando Liberação | 20.227 | 7.321 | Não |
| PENDING_PAYMENT | Aguardando Liberação | 39.832 | 14.382 | Não |
| CANCELED | Cancelado | 3.692 | 1.367 | Não |
| SUSPECTED_FRAUD | Cancelado | 4.062 | 1.488 | Não |

Nos 101.009 itens / 36.866 pedidos avaliados, `dias_atraso = dias_envio_real - dias_envio_programado`, com sinal; flag é 1 somente quando a diferença é positiva. Os 57.811 itens / 21.127 pedidos classificados como atrasados incluem PROCESSING/Em Trânsito. Não chamar esse conjunto inteiro de “entregas realizadas com atraso”.

Os **79.510 vazios / 28.886 pedidos** têm regra coerente: 71.756 itens aguardando liberação e 7.754 cancelados. **Preservar vazios**. Recalcular para todos geraria diferenças positivas em 45.589 desses itens, mas elas não são atrasos confirmados pela regra da Silver. Exemplo `64/156`: PENDING_PAYMENT, um dia programado, dois reais e atraso/flag vazios.

**Confirmações:** PROCESSING deve ser tratado como Em Trânsito e participar da avaliação? SUSPECTED_FRAUD deve ser rotulado Cancelado ou manter suspeita em análise? Por exemplo, `1100/2741` tem SUSPECTED_FRAUD e situação derivada Cancelado. Aprovar essas equivalências antes de o agente afirmar o status operacional.

**Aceite:** tabela de mapeamento e população elegível documentadas; tratamento dos nulos preservado na consulta e nos KPIs. A regra atual da aplicação de Marco precisa ser adaptada a esse contrato; isso não é automaticamente um defeito da Silver.

### R4 — Datas, Same Day e precisão do prazo

- `data_prevista_entrega = data_pedido + dias_envio_programado` exatamente em todas as linhas. O valor é reproduzível por essa fórmula; o CSV não comprova como foi gerado nem evidencia previsão por modelo.
- `dias_envio_real` coincide com a diferença entre **datas de calendário UTC** de envio e pedido em todas as linhas.
- Em **9.737 itens / 3.571 pedidos Same Day**, o intervalo de timestamp é sempre 12 horas; os dias reais são zero em 5.080 itens e um em 4.657, conforme cruza ou não a meia-noite UTC.
- Em 2.839 itens / 1.025 pedidos Same Day, a classificação é No Prazo embora o timestamp de envio seja 12 horas posterior ao timestamp previsto. Isso é compatível com a regra de calendário e **não é erro comprovado**.

Exemplos: `623/1523`, pedido às 01:54 e envio às 13:54 do mesmo dia, zero dias; `194/474`, pedido às 19:36 e envio às 07:36 do dia seguinte, um dia — ambos com intervalo de 12 horas.

**Ajuste:** documentar se duração significa dias de calendário ou horas decorridas; o que `data_envio` representa e se o sufixo Z corresponde a conversão efetiva para UTC. Não renomear envio para entrega por inferência. Se a previsão só tem validade por dia, evitar mostrar a hora como compromisso de SLA. Se for necessário prazo em horas, acrescentar medida separada com regra acordada, preservando a original.

### R5 — Arredondamento financeiro

Com cálculo decimal, `valor_item_pedido = valor_bruto_venda - valor_desconto` confere exatamente em 175.906 itens. Nos outros **4.613**, o líquido publicado está **0,01 acima** da subtração; não há diferença maior. O efeito acumulado é **46,13 unidades monetárias**. Exemplo `74/184`: `119,98 - 30,00 = 89,98`, mas o líquido publicado é `89,99`.

Isso pode decorrer de arredondamentos em etapas diferentes; sem precisão original não é possível exigir qual dos valores deve mudar. O bruto coincide com quantidade × preço exatamente; desconto não é negativo nem supera o bruto; líquido é positivo e não supera bruto.

**Ajuste:** fixar tipo decimal, precisão, momento e modo de arredondamento no pipeline/contrato. Reconciliar novamente após a decisão. Não corrigir centavos manualmente nem presumir moeda brasileira: o arquivo não informa moeda.

### R6 — Agregação do lucro, margem e unidade monetária

`lucro_total_pedido` está correto como total por pedido, mas **se repete em cada item**. Soma de `lucro_item`, ou de um único total por pedido: **3.966.902,97**. Soma indevida da coluna repetida nas 180.519 linhas: **13.758.404,49**. Não usar soma por linha nem `SUM(DISTINCT lucro_total_pedido)`, pois pedidos diferentes podem ter o mesmo valor. Agrupar por `id_pedido` ou usar a medida de item.

Há 33.784 itens com lucro negativo e 13.908 pedidos com total negativo. Margem varia de -2,75 a 0,50; 6.301 itens têm margem menor que -1. **Prejuízo não é erro automaticamente.**

A margem é mais compatível com razão lucro/líquido do que com valor já multiplicado por 100. Recalcular a partir dos valores publicados e arredondar a duas casas coincide em 173.604 linhas; 6.915 diferem. Todos os 180.519 registros são compatíveis com lucro, líquido e margem arredondados separadamente a duas casas, em intervalos de ±0,005. Logo, **não foi comprovado erro na margem**. Confirmar fórmula e precisão de origem; `0,34` deve ser interpretado como 34% se a unidade confirmada for razão.

**Aceite:** medidas de BI no grão correto e dicionário com moeda, unidade, fórmula e arredondamento. Sem moeda comprovada, não prefixar os números com R$.

### R7 — Taxonomia de produtos

Produto mantém metadados estáveis, mas **Electronics** aparece em Footwear (1.127 itens) e Outdoors (2.029), total 3.156 itens. Exemplo `165/391`: produto 276, `Under Armour Women's Ignite Slide`, categoria Electronics e departamento Footwear. Exemplo `151/355`: produto 835, `Bridgestone e6 Straight Distance NFL Carolina`, Electronics/Outdoors.

**Ajuste:** conferir se categoria/departamento foram copiados corretamente ou se a inconsistência vem da fonte. Se houver taxonomia normalizada, usar mapeamento revisado e preservar rótulos originais. Não é possível corrigir por suposição a partir do nome do produto. Se as categorias não forem usadas na entrega, isso pode ser registrado como limitação sem bloquear a consulta de pedido.

### R8 — Histórico e resumo para atendimento

Datas de pedido vão de **01/01/2015 a 31/01/2018**; datas de envio vão até **06/02/2018**. Há **93.658 itens / 33.932 pedidos** com status histórico Aguardando Liberação ou Em Trânsito. Isso não comprova operação pendente em 2026.

O resumo corresponde às colunas, mas não explicita antiguidade ou data de referência. Em todas as linhas aparece o rótulo **“Tempo Real de Trânsito”**, inclusive nos 79.510 itens não avaliados/cancelados. Exemplo `16/48`: PENDING_PAYMENT e Aguardando Liberação, mas texto apresenta dois dias de trânsito. A evidência é a combinação dos rótulos; sem dicionário não se pode afirmar que a duração esteja errada.

**Ajuste:** definir data de referência dos dados, versão da exportação, origem histórica/derivada/simulada e significado do tempo registrado. Revisar a redação para não afirmar trânsito ocorrido onde isso não foi confirmado. Data do arquivo não é atualização de localização.

O resumo também inclui código de cliente em todas as 180.519 linhas. Para a IA de rastreio, selecionar apenas os campos necessários; não enviar automaticamente o texto inteiro ou o CSV ao modelo. Consulta de pedido continua estruturada; o Chroma do projeto é para FAQ/políticas, não requisito para indexar todos os pedidos. Não há erro em manter o resumo como derivado, desde que seu uso e sua fonte estejam claros.

## Regras que devem ser preservadas

- Manter uma linha por item e ambos os IDs; não eliminar vários itens de um pedido como se fossem duplicatas.
- Manter atraso negativo como diferença assinada/adiantamento, se esse for o contrato aprovado; não convertê-lo em zero na Silver sem necessidade.
- Manter nulos para não avaliados/cancelados. Não substituí-los por zero para facilitar o dashboard.
- Preservar prejuízos e não remover outliers financeiros sem regra de negócio.
- Preservar fonte histórica e acrescentar eventos simulados separadamente, identificados. Não fabricar causa de atraso para preencher lacunas da fonte.

## Entrega solicitada a Dados

1. Confirmar se esta é a exportação atual, especialmente após a discussão de retirar coordenadas.
2. Fornecer dicionário das 41 colunas e notebook/regras de transformação, com origem dos campos derivados.
3. Corrigir/registrar a recuperação dos nomes geográficos e regenerar seus derivados.
4. Resolver ou isolar coordenadas e aprovar origem, status, atraso e precisão das datas.
5. Documentar moeda, agregação e arredondamento; revisar a taxonomia se for utilizada no BI.
6. Publicar nova versão identificada no local compartilhado, com contagens e hash para reprodução.

Não é necessário escolher outro banco ou recriar o dataset para atender a esta revisão. O banco final continua decisão do grupo.

## Evidências e limites de conclusão

Foram executadas varreduras independentes de estrutura/geografia/texto, datas/status e finanças, além de reconciliação decimal adicional. Os scripts e JSON de evidência ficam em `.state/revisao-silver-2026-11-14/`, fora do versionamento habitual. As verificações não dependem do Gemini.

Uma triagem retangular não substitui validação cartográfica. A consistência de uma fórmula inferida não prova que ela representa o evento de negócio correto. Esta auditoria não comprova causa, localização de veículo, fuso de origem, moeda ou correção frente ao Bronze não fornecido. Esses limites não invalidam os resultados estruturais e aritméticos demonstrados.

O perfil das 41 colunas está no anexo abaixo. Nenhuma correção foi aplicada ao CSV e nenhuma mensagem foi enviada ao grupo pelo assistente.

## Anexo — perfil das 41 colunas

Contagens de vazios e valores distintos são por item; nomes e códigos não foram convertidos para números. Campo preenchido não implica significado operacional validado.

| Coluna | Vazios | Distintos não vazios | Observação |
| --- | ---: | ---: | --- |
| `id_pedido` | 0 | 65.752 | Grão de pedido; repetição esperada entre itens |
| `id_item_pedido` | 0 | 180.519 | Único globalmente nesta versão |
| `id_cliente` | 0 | 20.652 | Código preservado; evitar exposição desnecessária ao modelo |
| `segmento_cliente` | 0 | 3 | Preenchido; estrutura consistente nesta exportação |
| `data_pedido` | 0 | 65.752 | UTC Z declarado; 2015–2018 |
| `data_envio` | 0 | 63.701 | Significado operacional a confirmar; ver R4 |
| `modo_envio` | 0 | 4 | Classe de serviço; não veículo/modal físico |
| `status_pedido` | 0 | 9 | Nove códigos; contrato observado em R3 |
| `dias_envio_programado` | 0 | 4 | Preenchido; estrutura consistente nesta exportação |
| `dias_envio_real` | 0 | 7 | Preenchido; estrutura consistente nesta exportação |
| `destino_cidade` | 0 | 3.597 | 130 itens com grafias contendo ?; sete com U+0092 |
| `mercado_logistico` | 0 | 5 | Cinco mercados; cada país aparece em um único mercado |
| `id_produto` | 0 | 118 | Preenchido; estrutura consistente nesta exportação |
| `nome_produto` | 0 | 118 | Preenchido; estrutura consistente nesta exportação |
| `categoria_produto` | 0 | 50 | Taxonomia Electronics a confirmar; ver R7 |
| `quantidade_item` | 0 | 5 | Preenchido; estrutura consistente nesta exportação |
| `valor_bruto_venda` | 0 | 193 | Preenchido; estrutura consistente nesta exportação |
| `valor_desconto` | 0 | 1.017 | Preenchido; estrutura consistente nesta exportação |
| `valor_item_pedido` | 0 | 2.927 | 4.613 diferenças de 0,01 na subtração; ver R5 |
| `lucro_item` | 0 | 21.998 | Valores negativos preservados como possível prejuízo |
| `latitude_origem` | 0 | 11.250 | Triagem geográfica em R2; não é GPS |
| `longitude_origem` | 0 | 4.487 | Triagem geográfica em R2; não é GPS |
| `preco_unitario` | 0 | 75 | Preenchido; estrutura consistente nesta exportação |
| `margem_lucro_item` | 0 | 162 | Razão e precisão a documentar; ver R6 |
| `departamento` | 0 | 11 | Taxonomia Electronics a confirmar; ver R7 |
| `tipo_pagamento` | 0 | 4 | Quatro códigos; significado a documentar |
| `dias_atraso` | 79.510 | 7 | Diferença com sinal; nulo em não avaliados/cancelados |
| `flag_atrasado` | 79.510 | 2 | 0/1 nos avaliados; não preencher nulo com zero |
| `data_prevista_entrega` | 0 | 58.633 | Reproduzível por pedido + dias programados |
| `janela_atraso` | 0 | 6 | Faixas coerentes com regra observada |
| `status_entrega_pt` | 0 | 5 | Classificação derivada; cinco valores |
| `situacao_rastreio` | 0 | 4 | Derivada do status do pedido; não GPS |
| `destino_pais` | 0 | 164 | Preenchido; estrutura consistente nesta exportação |
| `destino_estado` | 0 | 1.091 | Preenchido; estrutura consistente nesta exportação |
| `destino_regiao` | 0 | 23 | Preenchido; estrutura consistente nesta exportação |
| `origem_cliente_cidade` | 0 | 562 | Papel cliente/loja/despacho a confirmar |
| `origem_cliente_estado` | 0 | 44 | Usado no começo do texto de rota |
| `origem_cliente_pais` | 0 | 2 | EUA/Porto Rico; não é evidência isolada de sede |
| `rota_logistica` | 0 | 23.198 | Texto derivado; não demonstra trajeto real |
| `resumo_rastreio_rag` | 0 | 180.519 | Texto coerente com campos; ver interpretação em R8 |
| `lucro_total_pedido` | 0 | 35.779 | Total correto repetido em cada item; ver R6 |
