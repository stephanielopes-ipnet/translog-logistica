# Pipeline Medallion: Bronze → Silver

**Projeto:** Projeto Integrador Academy, Grupo 3 (cliente TransLog Brasil)
**Responsável:** Engenharia de Dados (Mateus)
**Dataset:** *DataCo Global Supply Chain* (Kaggle): cerca de 180 mil itens de pedido, de 2015 a 2018
**Consumidores da Silver:** Engenharia de IA (agente/RAG), FullStack (portal de rastreio) e, temporariamente, BI

---

## Resumo

- A **Bronze** guarda o CSV original sem nenhuma alteração, mais a data de ingestão e o nome do arquivo.
- A **Silver** limpa, tipa e padroniza os dados, protege dados pessoais e aplica as regras de negócio de prazo e atraso.
- A Silver tem **duas formas**:
  - a **tabela** `silver.pedidos_rastreio`, com o registro completo para auditoria;
  - a **view** `silver.vw_pedidos_rastreio`, o recorte em português, sem dados pessoais e sem colunas ambíguas. **É a única que os colegas acessam.**
- **Mudança mais importante:** a **regra de atraso** foi corrigida. O dataset marcava como "atrasados" até pedidos que nem tinham sido pagos. Isso inflava o indicador em **41.166 itens** e faria o portal e o agente de IA informarem um atraso inexistente ao cliente.
- **Tradução:** países, estados, regiões e localidades de origem foram padronizados em pt-BR com uma tabela de-para. O de-para também corrigiu 6 nomes que chegavam corrompidos ("?") pela codificação do arquivo.

---

## 1. Arquitetura e scripts

### Schemas
| Schema | Conteúdo | Quem acessa |
|---|---|---|
| `bronze` | Dados brutos, exatamente como vieram da origem | Só a Engenharia de Dados |
| `silver` | Dados limpos, tipados, enriquecidos e com regras de negócio, no nível de item de pedido | IA, FullStack e BI (só pela view) |
| `gold` | Tabelas agregadas de KPIs | BI e Gestão |

Os três são criados no `01_bronze_ingestao.sql` (`CREATE SCHEMA IF NOT EXISTS`). No GCP, equivalem aos datasets do BigQuery.

### Ordem de execução
| Script | Função |
|---|---|
| `notebooks/01_bronze_ingestao.sql` | Cria os schemas e carrega a Bronze |
| *(manual, uma vez)* | Importa `data/de_para_padronizacao_pt.csv` como `silver.dim_traducao` (Catalog → Add data) |
| `notebooks/02a_silver_tratamento_rotas_atrasos.sql` | Cria a tabela Silver (com os indicadores da PMO) e a quarentena |
| `notebooks/02d_silver_rastreio_simulado.sql` | **v2:** cria a malha de hubs (`silver.dim_hubs`) e o rastreio simulado (`silver.rastreio_pedidos`) |
| `notebooks/02e_silver_view_consumo.sql` | **v2:** cria a view de consumo. Antes ficava no 02a e mudou de lugar porque agora depende do rastreio |
| `notebooks/02b_silver_qualidade.sql` | Testes de qualidade (PASS/FAIL): tradução, indicadores da PMO, hubs e rastreio. Só lê, não altera dados. |
| `notebooks/02c_silver_auditoria_consumidores.py` | Auditoria do ponto de vista de FullStack e IA, mais o teste de aceitação na view. Só lê, não altera dados. |

A primeira tentativa de tradução, com tabelas separadas por coluna, foi substituída pelo de-para único e **não é mais executada**.

---

## 2. Camada Bronze

**Tabela:** `bronze.dataco_raw`

| O que contém | Como |
|---|---|
| Todas as 53 colunas do CSV original, sem tratamento | `read_files` com `header`, `inferSchema` e codificação `ISO-8859-1` |
| `_rescued_data` | Coluna técnica criada pelo `read_files` para valores que não couberam no schema. 100% nula. |
| `dt_ingestao_bronze` | `current_timestamp()` no momento da carga |
| `arquivo_origem` | Nome do arquivo lido (`DataCoSupplyChainDataset.csv`) |

A Bronze é a **fonte da verdade**: nada é corrigido nela. Se uma regra da Silver estiver errada, basta reprocessar a Silver a partir da Bronze, sem perder o dado original.

---

## 3. Camada Silver: visão geral

| Objeto | Tipo | Conteúdo | Para quem |
|---|---|---|---|
| `silver.pedidos_rastreio` | Tabela | Registro completo: todas as colunas tratadas, incluindo as originais de auditoria, a linhagem e o nome do cliente | Engenharia de Dados, testes e Gold |
| `silver.pedidos_quarentena` | Tabela | Registros reprovados nas regras de qualidade, com o motivo. **Hoje: 0.** | Auditoria |
| `silver.vw_pedidos_rastreio` | View | Recorte para consumo: pt-BR, sem dados pessoais, sem linhagem e sem colunas ambíguas | **IA, FullStack e BI** |
| `silver.dim_traducao` | Tabela | De-para de tradução (coluna, contexto, valor original, valor pt-BR) | Usada pela view |

**Grão:** 1 linha por **item de pedido** (`id_item_pedido`, único). Um pedido (`id_pedido`) pode ter vários itens.

---

## 4. Destaque: correção da regra de atraso

### 4.1 O problema
O dataset tem duas colunas de status que **não conversam entre si**:

- `Order Status`: situação do **pedido** (COMPLETE, PENDING_PAYMENT, PROCESSING...);
- `Delivery Status`: resultado da **entrega** (Late delivery, Shipping on time...).

O `Delivery Status` vem preenchido em **todos** os pedidos, inclusive nos que **nem tiveram o pagamento confirmado**:

| `Order Status` | Late delivery | Advance shipping | Shipping on time |
|---|---:|---:|---:|
| COMPLETE | 34.198 | 14.136 | 11.155 |
| CLOSED | 11.109 | 4.809 | 3.698 |
| PROCESSING | 12.503 | 5.369 | 4.030 |
| PENDING_PAYMENT | **22.922** | 9.588 | 7.321 |
| PENDING | **11.712** | 4.857 | 3.658 |
| ON_HOLD | **5.450** | 2.413 | 1.941 |
| PAYMENT_REVIEW | **1.082** | 420 | 391 |

*CANCELED (3.692) e SUSPECTED_FRAUD (4.062) aparecem só como "Shipping canceled". Contagem feita antes da recuperação dos 3 registros da seção 6.4.*

**Logisticamente, isso não faz sentido:** um produto não é despachado sem confirmação de compra. Então um pedido com pagamento pendente não pode estar "atrasado".

### 4.2 Por que isso importava
| Impacto | Exemplo |
|---|---|
| **Indicador inflado** | O KPI de atraso contaria 41.166 itens que nunca saíram para entrega |
| **Informação errada ao cliente** | O cliente pergunta ao agente de IA pelo pedido e recebe *"seu pedido está atrasado"*, quando na verdade *o pagamento ainda não foi processado*. A resposta errada gera uma nova ligação, justamente a dor de "atendimento sobrecarregado" do briefing. |
| **Causa do atraso escondida** | A análise de "atrasos sem causa conhecida" misturaria atraso logístico com pendência financeira |

### 4.3 A investigação
Antes de trocar a regra, verificamos de onde vinha o `Delivery Status`:

| `Delivery Status` | total | real > programado | real = programado | real < programado |
|---|---:|---:|---:|---:|
| Late delivery | 98.976 | **98.976** | 0 | 0 |
| Shipping on time | 32.194 | 0 | **32.194** | 0 |
| Advance shipping | 41.592 | 0 | 0 | **41.592** |
| Shipping canceled | 7.754 | 4.423 | 1.557 | 1.774 |

**Conclusão:** o `Delivery Status` é **100% derivado dos dias** (real × programado) e não diz se o pedido foi de fato enviado. O mesmo vale para `Late_delivery_risk`, que é idêntico ao "Late delivery". Por isso, calcular o atraso pelos dias e filtrar pelo `Order Status` **não perde nenhuma informação**.

Outro achado: a proporção de atraso é praticamente a mesma (~57%) em todos os status de pedido. Isso indica que o dataset é **sintético**: o resultado de entrega foi gerado sem relação com a situação do pedido.

### 4.4 A regra adotada
Um item **só é avaliado quanto ao prazo** quando o pedido de fato entrou na operação logística:

| `Order Status` | Avaliado? | `janela_atraso` | `situacao_rastreio` |
|---|---|---|---|
| COMPLETE, CLOSED | Sim | 1 a 4, conforme os dias | Entregue |
| PROCESSING | Sim | 1 a 4, conforme os dias | Em Trânsito |
| PENDING, PENDING_PAYMENT, PAYMENT_REVIEW, ON_HOLD | Não | 0. Não Avaliado (Aguardando Liberação) | Aguardando Liberação |
| CANCELED, SUSPECTED_FRAUD | Não | 5. Envios Cancelados | Cancelado |

**Atrasado** = `dias_envio_real > dias_envio_programado`, só entre os avaliados.

### 4.5 Antes × depois
| | Antes (`Delivery Status`) | Depois (regra nova) |
|---|---:|---:|
| Itens atrasados | 98.977 | **57.811** |
| Base do cálculo | 180.519 (todos) | 101.009 (só avaliados) |
| % de atraso | 54,8% | **57,2%** |

- A **quantidade** de atrasos cai em **41.166 itens**: os "atrasos" de pedidos que nunca foram enviados.
- O **percentual** sobe um pouco porque a base também encolheu. A taxa nova mede o atraso só onde existe uma entrega para cobrar.
- Os números já incluem os 3 registros recuperados da seção 6.4 (2 avaliados, sendo 1 atrasado). Na análise original, antes da recuperação, eram 57.810 de 101.007.

### 4.6 Colunas da regra
| Coluna | Conteúdo | Na view? |
|---|---|---|
| `dias_atraso` | Real − programado; **NULL** quando não se aplica (pendentes e cancelados) | Sim |
| `flag_atrasado` | **Coluna oficial para contar atrasos:** 1 atrasado, 0 no prazo ou adiantado, NULL não avaliado | Sim |
| `janela_atraso` | 0 Não Avaliado · 1 Adiantado (<0) · 2 No Prazo (0) · 3 Atraso Leve (1–2) · 4 Atraso Crítico (3+) · 5 Cancelado | Sim |
| `status_entrega_pt` | Adiantado / No Prazo / Atrasado / Não Avaliado / Cancelado | Sim |
| `situacao_rastreio` | Entregue / Em Trânsito / Aguardando Liberação / Cancelado | Sim |
| `avaliado_prazo` | true para COMPLETE, CLOSED e PROCESSING | Não (redundante: = `flag_atrasado IS NOT NULL`) |
| `pedido_cancelado` | true para CANCELED, SUSPECTED_FRAUD ou entrega cancelada | Não (redundante: = `situacao_rastreio = 'Cancelado'`) |

Usamos **NULL e não 0** nos casos não aplicáveis de propósito: com 0, o `AVG(dias_atraso)` e o percentual de atraso seriam puxados para baixo.

---

## 5. Colunas: o que saiu, o que entrou e por quê

As 56 colunas da Bronze (53 do CSV, mais `_rescued_data` e 2 de ingestão) tiveram este destino:

| Destino | Quantidade |
|---|---:|
| Mantidas e renomeadas, presentes na view | 32 |
| Mantidas só na tabela (fora da view) | 6 |
| Fora da Silver | 18 |
| **Total** | **56** |

Além das 32 originais, a view tem **9 colunas criadas**, somando **41 colunas**.

### 5.1 Colunas que não entraram na Silver (18)
| Motivo | Colunas | Como foi comprovado |
|---|---|---|
| **LGPD** (dados pessoais) | `Customer Email`, `Customer Password`, `Customer Street`, `Customer Zipcode` | Decisão de proteção de dados |
| **Vazias** | `Product Description`, `_rescued_data` | 100% nulas (EDA) |
| **Redundantes** | `Benefit per order` (= `Order Profit Per Order`), `Sales per customer` (= `Order Item Total`), `Order Customer Id` (= `Customer Id`), `Product Category Id` (= `Category Id`), `Product Price` (= `Order Item Product Price`) | Testes do 02b: 0 divergências |
| **Redundante** | `Order Item Cardprod Id` (= `Product Card Id`) | Consulta na Bronze: 0 diferenças |
| **Constante** | `Product Status` | Só 1 valor em todo o dataset |
| **Pouco preenchida** | `Order Zipcode` | 86% nula |
| **Pode ser calculada** | `Order Item Discount Rate` | = `valor_desconto / valor_bruto_venda` |
| **IDs que os nomes já cobrem** | `Category Id`, `Department Id` | `categoria_produto` e `departamento` estão na Silver |
| **Sem uso** | `Product Image` | URL de imagem do produto |

### 5.2 Colunas mantidas e renomeadas (32, todas na view)
| Bronze | Silver | Tratamento |
|---|---|---|
| `Order Id`, `Order Item Id`, `Customer Id`, `Product Card Id` | `id_pedido`, `id_item_pedido`, `id_cliente`, `id_produto` | `TRY_CAST INT` |
| `Customer Segment` | `segmento_cliente` | `TRIM` |
| `order date (DateOrders)` | `data_pedido` | Timestamp (`M/d/yyyy H:mm`) |
| `shipping date (DateOrders)` | `data_envio` | Timestamp (ver seção 10) |
| `Shipping Mode` | `modo_envio` | `TRIM` |
| `Order Status` | `status_pedido` | `TRIM` |
| `Days for shipment (scheduled)` / `Days for shipping (real)` | `dias_envio_programado` / `dias_envio_real` | `TRY_CAST INT`, valores originais intactos |
| `Customer City` / `Customer State` / `Customer Country` | `origem_cliente_cidade` / `_estado` / `_pais` | `INITCAP` na cidade, correção da seção 6.4, tradução |
| `Order City` | `destino_cidade` | `INITCAP` (nome próprio, sem tradução) |
| `Order State` / `Order Region` / `Order Country` | `destino_estado` / `destino_regiao` / `destino_pais` | `TRIM` e tradução |
| `Market` | `mercado_logistico` | `TRIM` |
| `Product Name` / `Category Name` / `Department Name` | `nome_produto` / `categoria_produto` / `departamento` | `TRIM` |
| `Order Item Quantity` | `quantidade_item` | `TRY_CAST INT` |
| `Order Item Product Price` | `preco_unitario` | 2 casas decimais |
| `Sales` / `Order Item Discount` / `Order Item Total` | `valor_bruto_venda` / `valor_desconto` / `valor_item_pedido` | 2 casas decimais |
| `Order Profit Per Order` | **`lucro_item`** | 2 casas decimais. **Renomeada**: o nome original engana (seção 10). |
| `Order Item Profit Ratio` | `margem_lucro_item` | 4 casas decimais |
| `Type` | `tipo_pagamento` | `UPPER` |

### 5.3 Colunas mantidas só na tabela, fora da view (6)
| Bronze | Silver (tabela) | Por que não está na view |
|---|---|---|
| `Customer Fname` + `Customer Lname` | `nome_cliente` | **Dado pessoal.** O portal busca o cliente pelo `id_cliente`. |
| `Delivery Status` | `status_entrega_original` | Marca "atraso" em pedidos não pagos (seção 4). Um agente Text-to-SQL que a usasse responderia 98.977 atrasos em vez de 57.811. Pode ser reconstruída a partir dos dias. |
| `Late_delivery_risk` | `risco_atraso_flag` | Idêntica ao `Delivery Status = 'Late delivery'`. Mesmo motivo. |
| `arquivo_origem` | `arquivo_origem` | Linhagem técnica, só para auditoria |
| `dt_ingestao_bronze` | `dt_ingestao_bronze` | Linhagem técnica, só para auditoria |

### 5.4 Colunas criadas
| Coluna | Regra | Onde |
|---|---|---|
| `dias_atraso`, `flag_atrasado`, `janela_atraso`, `status_entrega_pt`, `situacao_rastreio` | Seção 4 | Tabela e view |
| `data_prevista_entrega` | `data_pedido + dias_envio_programado`: a data prometida ao cliente. O dataset não traz essa data pronta. | Tabela e view |
| `rota_logistica` | `estado de origem -> região de destino (cidade - estado de destino)` | Tabela; remontada em pt-BR na view |
| `resumo_rastreio_rag` | Texto do pedido em linguagem natural, para o agente de IA (RAG). Usa `id_cliente`, **nunca o nome**. | Tabela; remontado em pt-BR na view |
| `lucro_total_pedido` | Soma de `lucro_item` por `id_pedido` | Só na view |
| `avaliado_prazo`, `pedido_cancelado` | Seção 4.6 | Só na tabela |
| `dt_processamento_silver` | Data e hora do processamento | Só na tabela |

Exemplo de `resumo_rastreio_rag` na view:
> Pedido #71024 (Item #174339) \| Cliente ID: 14577 \| Produto: Industrial consumer electronics (Categoria: Consumer Electronics) \| Modalidade: First Class \| Rota: Califórnia -> Europa Ocidental (Valence - Auvérnia-Ródano-Alpes) \| Situação: Entregue (Status Pedido: COMPLETE) \| Prazo do Envio: Atrasado \| Prazo Programado: 1 dias \| Tempo Real de Trânsito: 2 dias \| Diferença/Atraso: 1 dias (Janela: 3. Atraso Leve (1 a 2 dias)).

*(Os nomes traduzidos do exemplo são ilustrativos; os valores exatos vêm do de-para.)*

---

## 6. Tratamentos de dados

### 6.1 Deduplicação
`ROW_NUMBER()` por `Order Item Id`, mantendo a ingestão mais recente. A EDA confirmou **0 duplicatas**. A etapa fica como **salvaguarda** para recargas da Bronze.

### 6.2 Tipagem
- `TRY_CAST` em IDs, inteiros e valores: um valor inválido vira NULL e é barrado pela quarentena, em vez de quebrar o pipeline.
- As datas são convertidas do formato `M/d/yyyy H:mm`, com alternativa para o caso de a Bronze já ter inferido timestamp.

### 6.3 Limpeza de texto
- `TRIM` em todos os textos e vazio → NULL (`NULLIF`).
- `INITCAP` nas cidades e `UPPER` no tipo de pagamento.
- Valores monetários com 2 casas decimais e margem com 4.

### 6.4 Correção de origem (3 registros recuperados)
Três registros chegaram com os campos **deslocados**: a cidade veio com "Ca" (sigla da Califórnia) e o estado veio com o **CEP**.

| CEP no campo estado | Correção | Como foi confirmado |
|---|---|---|
| 91732 | El Monte, CA | Coordenadas do registro (34,07; −118,01) |
| 95758 | Elk Grove, CA | Coordenadas do registro (38,41; −121,45) |

Esses registros iam para a quarentena e agora entram corrigidos na Silver. Se uma recarga trouxer outro CEP desconhecido, a regra `origem_invalida` (estado numérico ou cidade nula) o envia para a quarentena.

### 6.5 Quarentena
Registros que violam alguma regra vão para `silver.pedidos_quarentena` com o motivo. **Nada é descartado sem registro.**

| Regra | Motivo gravado |
|---|---|
| ID do pedido ou do item nulo | `id_nulo` |
| Data inválida | `data_invalida` |
| Envio antes do pedido | `envio_antes_do_pedido` |
| Dias nulos ou negativos | `dias_envio_invalido` |
| `Late_delivery_risk` incoerente com o `Delivery Status` | `flag_risco_incoerente_com_status` |
| Estado de origem numérico ou cidade de origem nula | `origem_invalida` |

**Resultado atual: 0 registros**, depois da correção da seção 6.4.

---

## 7. Tradução para pt-BR

### 7.1 Diagnóstico
O idioma do dataset varia **por coluna**, não pela origem do pedido:

| Colunas | Idioma original |
|---|---|
| País e estado de destino, país de origem | Espanhol (Francia, Bahía, EE. UU.) |
| Região e mercado | Inglês (Western Europe, USCA) |
| Estado de origem | Sigla em inglês (CA, PR) |
| Cidades | Nome local |

### 7.2 Abordagem: tabela de-para, e não função de IA linha a linha
1. Extraímos os **valores distintos** de cada coluna (cerca de 1.900 valores, e não 180 mil linhas).
2. Uma LLM gerou o de-para em pt-BR (`data/de_para_padronizacao_pt.csv`), com o **país como contexto** para os estados, porque o mesmo nome de estado pode existir em países diferentes.
3. O CSV foi importado como `silver.dim_traducao` e a **view** aplica a tradução por `LEFT JOIN`.

**Por que de-para:**
- A tradução é **sempre igual** para o mesmo valor, então o `GROUP BY` não quebra.
- É **auditável**: qualquer pessoa pode abrir o CSV e conferir.
- **Não tem custo** por linha.
- Se faltar alguma tradução, o `COALESCE` mantém o valor original e **nunca gera NULL**.

| Coluna | Valores no de-para | Observação |
|---|---:|---|
| `destino_estado` | 1.117 | Chave: país + estado |
| `origem_cliente_cidade` | 562 | Só 4 alteradas (ex.: New York → Nova York) |
| `destino_pais` | 164 | |
| `origem_cliente_estado` | 44 | Sigla → nome por extenso. **"PR" → "Porto Rico"**, o que elimina a confusão com o Paraná. |
| `destino_regiao` | 23 | Preserva o espaço duplo original de "South of  USA" |
| `origem_cliente_pais` | 2 | EE. UU. → Estados Unidos, Puerto Rico → Porto Rico |

### 7.3 Correção de codificação
Seis nomes chegavam com **"?"** no lugar de letras que não existem na codificação ISO-8859-1 usada na leitura do CSV (ex.: `Bra?ov`, `Gy?r`, `Klaip?da`). O de-para usou o valor corrompido como chave e **restaurou o nome correto** (Brașov, Győr, Klaipėda).

### 7.4 O que não foi traduzido
`mercado_logistico`, `categoria_produto`, `departamento`, `segmento_cliente`, `tipo_pagamento` e `status_pedido` continuam no original. `modo_envio` fica no original nas tabelas internas e recebe um rótulo pt-BR que explicita o prazo de despacho nas saídas (`consumo_*` e Gold), via `silver.dim_traducao`: Same Day → Expresso (despacho no mesmo dia), First Class → Prioritário (despacho em 1 dia), Second Class → Rápido (despacho em 2 dias), Standard Class → Padrão (despacho em 4 dias). `destino_cidade` e `nome_produto` também, por serem nomes próprios.

### 7.5 Validação (02b, seções 3b a 3e)
- Nenhum valor da Silver ficou sem par no de-para.
- O de-para não tem chaves duplicadas, o que garante que a view não multiplica linhas.
- Nenhum "?" sobrou nos nomes.
- Leitura humana de um texto RAG por situação.

---

## 8. Tabela × view: por que separar

### 8.1 Por que duas formas
| | Tabela `silver.pedidos_rastreio` | View `silver.vw_pedidos_rastreio` |
|---|---|---|
| **Objetivo** | Registro completo e auditável | Contrato de consumo |
| **Dados pessoais** | Tem `nome_cliente` | Não tem |
| **Colunas originais de atraso** | Tem (`status_entrega_original`, `risco_atraso_flag`) | Não tem |
| **Linhagem** | Tem (`arquivo_origem`, `dt_ingestao_bronze`, `dt_processamento_silver`) | Não tem |
| **Idioma** | Valores originais | pt-BR (de-para) |
| **Extras** | `avaliado_prazo`, `pedido_cancelado` (usados nos testes) | `lucro_total_pedido` |
| **Quem lê** | Engenharia de Dados, testes do 02b e a Gold | IA, FullStack e BI |

**A tabela guarda informações que precisam ser preservadas**, mesmo sem ir para os consumidores:
- as colunas originais permitem **reconstruir e auditar** a regra de atraso a qualquer momento;
- a linhagem mostra de qual carga veio cada registro;
- os valores sem tradução são a referência para corrigir o de-para.

**A view entrega só o necessário para cada consumidor**, sem nada que possa confundir ou expor dados.

### 8.2 Por que uma view, e não uma segunda tabela
- **Não duplica dados** e está **sempre sincronizada**: quando a tabela é reprocessada, a view já reflete a mudança.
- **Controle de acesso:** os colegas recebem `SELECT` **só na view**, e não no schema ou na tabela. Assim eles **não conseguem** ler o `nome_cliente` nem as demais colunas restritas.
- **Menos colunas ambíguas para o agente de IA:** com uma única coluna oficial de atraso (`flag_atrasado`), o agente Text-to-SQL não tem como escolher a coluna errada.

### 8.3 Acesso do BI à Silver (decisão temporária da equipe)
O cenário ideal é o BI consumir **só a Gold** (dados agregados). Por decisão da equipe, e para **não travar o trabalho do colega de BI** no prazo curto do projeto, ele recebeu acesso **de leitura à view Silver** e uma cópia em CSV (pelo Drive).

**Próximo passo:** entregar a Gold na **segunda-feira (16/11/2026)**. Antes disso, a Gold precisa ser ajustada para usar `flag_atrasado` (ver Pendências). Se não for, o dashboard mostraria 98.977 atrasos contra 57.811 na Silver.

---

## 9. Testes e validação

**`02b_silver_qualidade.sql`**: painel PASS/FAIL. ✅ Todos passaram.

| Grupo | Testes |
|---|---|
| Integridade | Bronze = Silver + quarentena; `id_item_pedido` único; campos críticos sem nulos |
| Regra de atraso | Cancelados e não avaliados sem `dias_atraso`; `flag_atrasado` coerente com os dias e com as datas; `data_prevista_entrega` coerente com o prazo |
| LGPD | Nenhum texto RAG contém o nome do cliente |
| View | Sem colunas proibidas; mesmo número de linhas que a tabela |
| Redundância | Provas de que as colunas removidas eram cópias |
| Tradução | Cobertura total, sem chaves duplicadas, sem "?" |

**`02c_silver_auditoria_consumidores.py`**: auditoria para FullStack e IA (nulos, domínios, consistência financeira, datas, armadilhas para Text-to-SQL, RAG) e teste de aceitação na view (busca por pedido, busca por cliente, KPI oficial, colunas expostas).

---

## 10. Problemas encontrados e como foram resolvidos

| # | Achado | Como foi descoberto | Decisão |
|---|---|---|---|
| 1 | `Delivery Status` atribui atraso a pedidos não pagos | Cruzamento `Order Status × Delivery Status` | Nova regra de atraso (seção 4) |
| 2 | `Delivery Status` e `Late_delivery_risk` são 100% derivados dos dias | Comparação com real × programado | Ficam só na tabela, fora da view |
| 3 | Dataset sintético | Mesma proporção de atraso (~57%) em todos os status | Registrado como premissa |
| 4 | `Order Profit Per Order` é o lucro **do item**, não do pedido | Em 100% dos pedidos com vários itens, o lucro varia entre os itens, e lucro = margem × total do item | Renomeada para `lucro_item`; criado `lucro_total_pedido` na view |
| 5 | `shipping date` = data do pedido + dias **reais** em 100% das linhas | `DATEDIFF` contra os dias | Mantida como `data_envio`; criada `data_prevista_entrega` |
| 6 | `Product Price` = `Order Item Product Price` | 0 divergências; os dois batem com `Sales` | Mantido só `preco_unitario` |
| 7 | 3 registros com CEP no campo estado | Quarentena + coordenadas | Recuperados (seção 6.4) |
| 8 | 6 nomes com "?" por causa da codificação | Revisão do de-para | Corrigidos pelo de-para |
| 9 | Nome completo do cliente no texto do RAG | Auditoria do 02c (100% dos textos) | Trocado por `id_cliente` |
| 10 | Risco de o agente de IA contar atrasos errados | Auditoria do 02c (98.977 × 57.811) | Colunas originais fora da view |
| 11 | 940 linhas onde bruto − desconto ≠ total | Auditoria do 02c | Diferença máxima de 0,01: só arredondamento, sem ação |
| 12 | 33.784 itens com lucro negativo | Auditoria do 02c | Dado real (prejuízo), mantido. Pode virar insight para o BI. |
| 13 | 227 coordenadas fora dos EUA e de Porto Rico | Caixa geográfica + análise por cidade | Colunas removidas da Silver (sem uso e não confiáveis) |

---

## 11. Premissas e limitações

- **"Em Trânsito" é uma premissa de simulação.** O DataCo é histórico e não tem status de trânsito. Tratamos `PROCESSING` como "Em Trânsito" para o portal.
- **Não há rastreio em tempo real no dataset.** Latitude e longitude do DataCo formam **um ponto fixo por item**, sem horário e sempre no país de origem (loja ou cliente: o dataset é ambíguo), não a posição do pacote, e 227 delas são incoerentes (sinal de menos perdido, vírgula deslocada). Por isso **as colunas foram removidas da Silver**: ficam só na Bronze. O rastreio do portal é **simulado** a partir das datas e da situação, coerente com o briefing: *"a TransLog não tem rastreio em tempo real"*.
- **`data_envio` (Shipping date) = data da entrega** (premissa da v2, seção 13.2): pedido + dias reais em 100% das linhas. Só a data é confiável (a hora tem erro de ±12h em 5,4% das linhas). Na view, a data de entrega aparece como `data_entrega_real`, só para entregues.
- **Os 18% do briefing contra os 57% do dataset:** o DataCo não reflete os números da TransLog. Os indicadores demonstram o **método**, não o valor real do cliente.
- **Arredondamento:** os valores estão em `DOUBLE` com 2 casas decimais, o que gera diferenças de até 0,01 entre totais.

---

## 12. Pendências

- [ ] **Gold:** trocar `status_entrega_original = 'Late delivery'` por `flag_atrasado = 1` e usar só os avaliados no denominador, **antes da entrega ao BI (16/11)**
- [ ] Reexecutar o `02c` com os dados atuais (a última execução foi antes das correções finais)
- [ ] (Opcional) Traduzir as colunas da seção 7.4
- [ ] (Opcional) `COMMENT` em cada coluna, para ajudar o agente Text-to-SQL
- [ ] **v2:** rodar 02a → 02d → 02e → 02b no Databricks e confirmar que todos os testes dão PASS
- [ ] **v2:** gerar os hubs pela LLM (`contexto/prompt_hubs_llm.md`), comparar com os derivados e escolher a versão
- [ ] **v2:** confirmar com o grupo a premissa de datas e a matriz do rastreio (seções 13.2 e 13.6)
- [ ] **Gold:** `gold.inteligencia_rotas` (região × modal: taxa no prazo, P80, classe, modal recomendado)

---

## 13. Silver v2: indicadores da PMO, malha de hubs e rastreio simulado

> **Substituída em parte pela Silver v3 (seção 14).** A premissa de datas (13.2), os nomes `data_prevista_entrega`/`data_entrega_real`, a situação "Entregue" e o rastreio sorteado no 02d (13.6) **não valem mais**. Os indicadores da PMO (13.3), os achados (13.4) e a malha de hubs (13.5) continuam válidos, agora lidos como **despacho**.

### 13.1 Por que
A TransLog precisa saber **onde cada pedido está** (portal e agente de IA) e **quanto, onde e por que atrasa** (BI e PMO). O DataCo só tem datas macro (pedido, entrega, dias programados e reais), sem a posição da carga. A v2 acrescenta:
- os **indicadores pedidos pela PMO**, calculados na tabela (02a);
- uma **malha de hubs** e a **posição simulada** de cada pedido despachado (02d);
- essas colunas na view (02e), com uma **matriz de consistência** validada no 02b.

**Regra de ouro da v2:** só a **posição** do pedido (etapa, local e hub) é simulada, marcada com `dado_simulado = true`. Atraso, causa e motivo vêm **apenas de dados reais**.

### 13.2 Premissa de datas
A base é sintética e foi escolhida pelo desafio para medir **atraso de entrega**, como dizem os próprios rótulos dela (`Delivery Status = "Late delivery"`, `Late_delivery_risk`). Adotamos esta leitura como **premissa de negócio**:

| Coluna original | Coluna Silver | Significado adotado |
|---|---|---|
| `Days for shipment (scheduled)` | `dias_envio_programado` | Prazo de **entrega** prometido ao cliente (definido pelo modal: 0, 1, 2 ou 4 dias) |
| `Days for shipping (real)` | `dias_envio_real` | Tempo do pedido até a **entrega**. **Para PROCESSING:** dias em trânsito até o momento da foto |
| `Shipping date (DateOrders)` | `data_envio` (só na tabela) | = pedido + dias reais em 100% das linhas (por dia) = **data da entrega** dos entregues. Na view vira `data_entrega_real` |

- **Por que a exceção no PROCESSING:** o status diz que o pedido ainda não chegou, então os dias reais dele não podem ser o tempo total de entrega. A única leitura compatível com o status é o tempo decorrido até agora. Com ela, "em trânsito há mais dias que o prometido = atrasado", e a fórmula e os números da v1 não mudam: 57.811 atrasados de 101.009 avaliados.
- **`Late delivery` continua consistente:** o rótulo original é 100% igual a `dias reais > dias programados` (seção 4). Pela premissa de entrega, ele significa exatamente "entregue (ou em trânsito) depois do prometido". A única inconsistência do rótulo é ser aplicado a pedidos não pagos e cancelados, e por isso a regra oficial é o `flag_atrasado`.
- **Usar só a data, nunca a hora:** em 9.737 linhas (5,4%), a hora da `Shipping date` difere da hora do pedido em exatamente ±12h (provável AM/PM perdido na origem). Todos os testes comparam por dia.
- **Leitura alternativa avaliada e descartada:** "tudo é despacho" fecha com o dado (o prazo é igual para qualquer destino), mas eliminaria a única medida de entrega da base e contrariaria o desafio. Ver 13.8.

### 13.3 Indicadores da PMO (tabela e view)
| PMO pediu | Coluna | Regra |
|---|---|---|
| atraso_dias | `dias_atraso` (já existia) | real − programado; NULL se não avaliado |
| no_prazo | `no_prazo` | 1 se `flag_atrasado = 0`, 0 se `= 1`, NULL se não avaliado |
| faixa_atraso | `faixa_atraso` | `No prazo` (≤ 0) / `1-2 dias` / `3+ dias` / NULL |
| data_entrega_prevista | `data_prevista_entrega` (já existia) | pedido + dias programados. Na view, NULL para não despachados e cancelados |
| data_entrega_real | `data_entrega_real` | `Shipping date`, **só para entregues** (COMPLETE/CLOSED). NULL para em trânsito, não despachados e cancelados |
| rota | `rota_servico` (só na view) | `mercado - região - modal`, já em pt-BR |
| periodo_pico | `periodo_pico` | 1 se o pedido é de novembro ou dezembro. **Só dimensão** para o BI investigar; não é causa |
| receita_em_risco | `receita_em_risco` | `valor_bruto_venda` (Sales) se atrasado, senão 0 |
| causa_provavel | `causa_provavel` | regra abaixo |

**`causa_provavel`** (derivada só de dados reais):

| Situação | Valor | Itens |
|---|---|---|
| Não avaliado (não despachado/cancelado) | NULL | — |
| No prazo | `Sem atraso` | 43.198 |
| Atrasado com prazo prometido ≤ 1 dia (Same Day, First Class) | `Promessa irreal` | 18.314 |
| Demais atrasados | `Atraso operacional` | 39.497 |

- A regra da PMO falava em "internacional". Ela foi estendida ao doméstico porque o problema está no prazo prometido, não no destino: o First Class atrasa 100% também nos EUA.
- O "período de pico" foi **retirado da causa**: o dado não mostra efeito de pico (58,1% de atraso em novembro/dezembro contra 57,1% no resto do ano). Fica como dimensão `periodo_pico` para o BI.
- A receita em risco soma cerca de **11,77 milhões** em vendas de itens atrasados.

### 13.4 Achados que a PMO precisa saber
- **O atraso depende só do modal.** Entre os pedidos avaliados, o percentual de atraso é:
  - First Class: 100% (promete 1 dia e leva sempre 2);
  - Second Class: 80%;
  - Same Day: 48%;
  - Standard: 40%.

  Doméstico e internacional dão o mesmo resultado, e o mercado quase não muda nada (55,8% a 58,5%).
- **Não há sazonalidade:** novembro e dezembro têm 58,1% de atraso, contra 57,1% no resto do ano.
- **"Onde atrasa"** se responde com dados reais pela `rota_servico` (mercado · região · modal) e pela futura `gold.inteligencia_rotas`, não pela etapa simulada.

### 13.5 Malha de hubs (`silver.dim_hubs`)
| Tipo | Quantidade | Regra |
|---|---|---|
| `GATEWAY_ORIGEM` | 5 (fixos) | Miami (EUA → LATAM), Nova York (EUA → Europa/África), Los Angeles (EUA → Ásia-Pacífico), Memphis (EUA → EUA/Canadá), San Juan (origem Porto Rico) |
| `CD_NACIONAL` | 164 | 1 por país de destino, na cidade com mais pedidos do país |
| `ALFANDEGA` | 163 | 1 por país internacional, na cidade do CD |
| `ARMAZEM_ESTADUAL` | 370 | só os **3 estados com mais pedidos** de cada país (~60% dos pedidos). Os demais estados são atendidos direto pelo CD |

- Os nomes são **derivados dos dados**, no formato `CD <cidade> (<país>)` e `Armazém <cidade> - <estado> (<país>)`.
- `id_hub` é determinístico (md5 da chave). Assim, uma versão gerada por LLM pode ser comparada pela chave: veja a seção 4 do 02d e o prompt em `contexto/prompt_hubs_llm.md`, que fica fora do Git.
- O gateway de Memphis foi acrescentado para que os pedidos domésticos e os do Canadá não passem por um gateway internacional.

### 13.6 Rastreio (`silver.rastreio_pedidos`, 1 linha por pedido)
**Etapas:** 1 Coleta (gateway) · 2 Voo · 3 Alfândega · 4 Transferência (CD → armazém) · 5 Última milha / entregue.

**Etapas por tipo de rota:**

| Rota | Etapas | Modal (`modal_transporte`) |
|---|---|---|
| Internacional | 1-2-3-4-5 | Aéreo expresso (Same Day/First Class) ou aéreo consolidado (Second/Standard) |
| Doméstica aérea (origem Porto Rico, ou Same Day/First Class) | 1-2-4-5 (voo, sem alfândega: Porto Rico é território dos EUA) | Aéreo expresso (Same Day/First Class) ou aéreo consolidado (Porto Rico, Second/Standard) |
| Doméstica rodoviária (EUA → EUA, Second/Standard) | 1-4-5 | Rodoviário |

Não existe marítimo: prazos de 0 a 6 dias são incompatíveis com transporte por navio.

**Matriz de consistência** (o que cada pedido pode ter na view; qualquer combinação fora dela reprova no 02b):

| status_pedido | `situacao_rastreio` | etapa / local / hub / modal | `data_prevista_entrega` | `data_entrega_real` | `dias_envio_real` | `flag_atrasado` | `motivo_ocorrencia` |
|---|---|---|---|---|---|---|---|
| PENDING, PENDING_PAYMENT, PAYMENT_REVIEW, ON_HOLD | Aguardando Liberação | NULL (sem pagamento não há despacho) | NULL | NULL | NULL | NULL | NULL |
| CANCELED, SUSPECTED_FRAUD | Cancelado | NULL | NULL | NULL | NULL | NULL | NULL |
| PROCESSING | Em Trânsito | etapa sorteada entre as etapas da rota; local = hub ou "Em voo …" | preenchida | NULL (não chegou) | dias em trânsito | 0/1 | factual |
| COMPLETE, CLOSED | Entregue | 5, "Entregue em …" | preenchida | preenchida | dias até a entrega | 0/1 | factual |

- **`situacao_rastreio` é a única coluna de situação.** O `status_movimento` e o status "Retido" foram retirados: "Retido" era só outro nome para "em trânsito e atrasado", que o `flag_atrasado = 1` já informa. Isso também eliminou a contradição "Retido + Em voo".
- **Única parte simulada:** a etapa de quem está em trânsito, sorteada por `pmod(xxhash64(id_pedido, 'etapa'), 100)`. Rodar de novo dá o mesmo resultado. Ela não afirma nada sobre atraso.
- **`motivo_ocorrencia` é factual**, montado só com números reais:

  | Caso | Exemplo |
  |---|---|
  | No prazo | `Entregue em 3 dia(s), dentro do prazo prometido de 4 dia(s).` |
  | Promessa irreal | `Entregue em 2 dia(s), 1 dia(s) além do prazo prometido de 1 dia(s). Prazo irreal para a modalidade First Class: só 0.0% das entregas dela cumprem o prazo prometido.` |
  | Atraso operacional | `Em trânsito há 6 dia(s), 2 dia(s) além do prazo prometido de 4 dia(s). A base não registra o motivo do atraso.` |

  O percentual "no prazo" da modalidade é calculado na própria base, só sobre entregues.
- **`etapa_gargalo` foi retirado.** A base não diz em que etapa o atraso ocorreu, e um gargalo sorteado geraria falsos insights no BI: o gráfico mediria a regra, não a operação.

### 13.7 Limitações conhecidas da v2
| Limitação | Tratamento |
|---|---|
| Prazo real igual para qualquer destino; existe Same Day internacional em 0 dia | Limitação da base sintética; não tratada |
| Cidades dos hubs sem tradução (ex.: `CD New York City (Estados Unidos)`) | De-para de cidades em preparação (`coluna = destino_cidade`, `contexto = destino_pais`, valor com `INITCAP`) |
| A "cidade com mais pedidos" pode ser pequena ou sem perfil logístico | Aceito (dados fictícios); a versão LLM dos hubs pode melhorar |
| No DataCo, a cidade nem sempre pertence ao estado indicado | Intrínseco da base; exigiria uma base externa cidade-estado. A versão LLM marca `REVISAR` |
| CD e armazém podem ficar na mesma cidade | Aceito |
| Não há horário nem histórico de etapas ("desde quando está ali") | Não criado de propósito: dividir o tempo total por etapa seria inventar informação. O `dias_envio_real` do PROCESSING já informa há quantos dias o pedido está em trânsito |
| A etapa de quem está em trânsito é sorteada, sem relação com o tempo decorrido | Aceito; é a parte simulada, marcada com `dado_simulado` |

### 13.8 Sugestões avaliadas e não adotadas
| Sugestão | Por que não |
|---|---|
| Data de corte (pedidos dos últimos dias = ativos) | Contradiz o `status_pedido`: um pedido COMPLETE apareceria "em trânsito" |
| "Hoje" sorteado por pedido | Inventaria o atraso de todo PROCESSING; a exceção dos dias em trânsito usa o próprio dado |
| Ler todas as datas como despacho | Fecha com o dado, mas elimina a medida de entrega, contraria o desafio e exigiria simular a entrega inteira |
| Marítimo para Standard e Second Class | Impossível com prazos de no máximo 6 dias |
| Gargalo e motivo sorteados; período de pico como causa | Afirmariam causas que o dado não mostra (falsos insights) |
| Tabela de histórico de eventos por pedido | Todo o histórico seria fictício; a posição atual atende o portal e a IA |

### 13.9 Testes novos (02b)
- **Indicadores da PMO:**
  - `no_prazo` é o inverso da flag;
  - `faixa_atraso` bate com `dias_atraso`;
  - `data_entrega_real` = `Shipping date` só nos entregues, NULL nos demais;
  - `periodo_pico` bate com o mês;
  - `receita_em_risco` só aparece nos atrasados;
  - `causa_provavel` segue a regra (sem pico).
- **Hubs:** id único; 1 CD por país; no máximo 3 armazéns por país.
- **Rastreio:**
  - 1 linha por pedido;
  - o hub atual existe na malha;
  - matriz status × posição: não despachado/cancelado sem posição nem motivo; despachado com tudo; entregue na etapa 5;
  - etapas coerentes com a rota: doméstico nunca na alfândega; rodoviário nunca voa; Porto Rico sempre aéreo.
- **View:**
  - matriz situação × datas × posição (seção 13.6);
  - sem `data_envio`, `status_movimento` e `etapa_gargalo`;
  - contém as 10 colunas novas principais.

## 14. Silver v3: premissa de despacho e entrega simulada

### 14.1 O que mudou e por quê
O DataCo não tem documentação oficial, e a nomenclatura do setor e os dados indicam que `Shipping date` / `Days for shipping (real)` medem o **despacho**. A decisão, validada com o instrutor, está em `04_decisao_premissa_despacho.md`. A v3 aplica essa leitura em todo o pipeline:
- **Despacho = dado real.** O atraso oficial (`flag_atrasado`, `dias_atraso`, `causa_provavel`, `receita_em_risco`) passa a ser lido como **atraso no despacho**. Os valores não mudam: são 57.811 itens atrasados de 101.009 avaliados.
- **Entrega = simulada.** O resultado do transporte segue o padrão combinado com o instrutor (60% no prazo, 20% com atraso, 20% com extravio) e é sempre identificado com `dado_simulado`.
- **Uma única fonte de posição.** A posição do pedido é o **último evento** do 02g, consolidado no 02i. O 02d não sorteia mais etapa.
- **Uma única hipótese.** O cenário `entrega` foi removido. As views leem só a fatia publicada (`silver.simulacao_publicada`).

### 14.2 Nomes antigos → novos
| Antes | Agora | Observação |
|---|---|---|
| `flag_atrasado` | `flag_atraso_despacho` | Valores iguais (atraso no despacho) |
| `dias_atraso` | `dias_atraso_despacho` | |
| `no_prazo` | `despacho_no_prazo` | |
| `faixa_atraso` | `faixa_atraso_despacho` | |
| `janela_atraso` | `janela_atraso_despacho` | |
| `causa_provavel` | `causa_atraso_despacho` | |
| `data_prevista_entrega` (pedido + prazo programado) | `data_despacho_prevista` (DATE) | `data_entrega_prevista` passou a ser a promessa de **entrega** |
| `data_entrega_real` (= Shipping date) | `data_despacho_real` (DATE) | A entrega é `data_entrega_realizada` |
| `status_entrega_pt` | `status_prazo_despacho` | |
| `situacao_rastreio = 'Entregue'` | `situacao_rastreio = 'Despachado'` | A entrega fica em `situacao_entrega` |
| `receita_em_risco` (itens com despacho atrasado) | só na Gold v3 | Agora é a venda dos pedidos com **entrega atrasada ou extraviada** |
| posição sorteada no 02d | posição = último evento (02g → 02i) | |
| — | `tipo_rota` na tabela (02a) | Derivado do país de destino |

**Regra da entrega (v3):** 60% no prazo, 20% com atraso e 20% extraviados nos concluídos. Toda entrega atrasada vem de despacho atrasado; parte dos despachos atrasados é recuperada no transporte (calibrada na base inteira). Detalhes em `05_arquitetura_dados_silver.md`, seção 4.

**Views sem marca de simulação:** `dado_simulado`, fonte, versão e escopo ficam só nas tabelas. O texto da IA usa linguagem de operação.

### 14.3 Ordem de execução
01 → 01b → 02a → 02d (hubs) → 02g (eventos; chama o 02f) → 02i (rastreio) → 02e (view) → 02b (testes Silver) → 02h (testes da simulação) → 03c (Gold OBT) → 03d (testes da Gold).

A arquitetura completa, o dicionário de colunas e o uso por consumidor estão em `05_arquitetura_dados_silver.md`.
