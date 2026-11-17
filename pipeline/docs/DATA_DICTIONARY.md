# Dicionário de Dados — TransLog Logística

Documentação técnica de todas as tabelas e views do pipeline Medallion no Databricks (catálogo `workspace`, schemas `bronze`, `silver` e `gold`), com foco nas camadas de consumo (`silver.consumo_*`, `gold.obt_*` e `gold.vw_*`) e no fluxo de geração de dados sintéticos.

---

## 1. Premissas Gerais e Governança

- **Base de origem:** *DataCo Global Supply Chain* (`DataCoSupplyChainDataset.csv`), 180.519 itens em 65.752 pedidos (01/2015 a 01/2018).
- **Data de referência da base (`D`):** `06/02/2018` — calculada dinamicamente em `02a` como `GREATEST(MAX(data_pedido), MAX(data_envio))`. Todos os eventos e status representam uma foto histórica em `D`.
- **Premissa temporal (real × simulado):**
  - **Real (DataCo):** pedido (`data_pedido`) e **despacho** (`Shipping date` = `data_envio` / `data_despacho_real`, `dias_envio_programado`, `dias_envio_real`), além de produto, cliente (ID/segmento), destino e valores financeiros.
  - **Derivado do real:** métricas de atraso no despacho (`flag_atraso_despacho`, `dias_atraso_despacho`, `causa_atraso_despacho`), `tipo_rota`, `situacao_rastreio`.
  - **Simulado (pós-despacho):** malha de hubs (`silver.dim_hubs`), `modal_transporte`, eventos logísticos pós-despacho, datas e atraso de entrega, recuperação de atraso no transporte e extravios (padrão calibrado de ~60% entregue no prazo / ~20% com atraso / ~20% extraviado nos pedidos concluídos, determinístico via `xxhash64(id_pedido, ...)`).
- **LGPD:** colunas pessoais (`Customer Email`, `Customer Password`, `Customer Street`, `Customer Zipcode`, `Order Zipcode`) são descartadas antes da Silver. `nome_cliente` existe apenas na tabela interna `silver.pedidos_rastreio` e **nunca** é exposta nas tabelas `silver.consumo_*`, textos RAG ou camada `gold.*`.
- **Separação de consumidores:**
  - **IA / RAG e Portal FullStack:** leem **exclusivamente** as tabelas `silver.consumo_*` (não expõem marcas de simulação nem lucro/margem interna).
  - **BI / Gestão (PMO):** lê **exclusivamente** a camada `gold.*` (escopo restrito aos **36.866 pedidos despachados**, com rótulo explícito `origem_dado_despacho` / `origem_dado_entrega` / `rotulo_fonte`).

---

## 2. Linhagem Ponta a Ponta (Resumo)

```text
DataCoSupplyChainDataset.csv ──► 01_bronze_ingestao.sql ──► bronze.dataco_raw
de_para.csv (+ modo_envio)   ──► 01b_silver_dim_traducao.sql ──► silver.dim_traducao

bronze.dataco_raw ──► 02a_silver_tratamento_rotas_atrasos.sql ──► silver.pedidos_rastreio (+ silver.pedidos_quarentena)
silver.pedidos_rastreio + silver.dim_traducao ──► 02d_silver_rastreio_simulado.sql ──► silver.dim_hubs
silver.pedidos_rastreio + silver.dim_hubs + silver.dim_traducao
   ──► 02f_silver_preparacao_simulacao.py (%run por 02g)
   ──► 02g_silver_geracao_eventos.py
         ├──► silver.eventos_logisticos
         ├──► silver.entregas_simuladas
         ├──► silver.eventos_logisticos_quarentena
         └──► silver.simulacao_publicada

silver.pedidos_rastreio + silver.simulacao_publicada + silver.entregas_simuladas + silver.eventos_logisticos + silver.dim_traducao
   ──► 02i_silver_consolidacao_rastreio.sql
         ├──► silver.rastreio_pedidos
         └──► silver.consumo_eventos_logisticos

silver.pedidos_rastreio + silver.rastreio_pedidos + silver.consumo_eventos_logisticos + silver.dim_traducao
   ──► 02e_silver_view_consumo.sql
         ├──► silver.consumo_itens_pedido
         └──► silver.consumo_pedidos (CDF habilitado)

silver.pedidos_rastreio + silver.rastreio_pedidos + silver.consumo_eventos_logisticos + silver.dim_traducao + gold_pais_mapa
   ──► 03c_gold_obt.sql
         ├──► gold.obt_pedidos_logistica
         ├──► gold.obt_itens_risco
         ├──► gold.obt_eventos_etapas
         ├──► gold.param_cenario_prazo
         └──► gold.vw_cenarios_prazo (VIEW sobre obt_pedidos_logistica + param_cenario_prazo)
```

---

## 3. Camada Silver — Tabelas de Consumo (`silver.consumo_*`)

As três tabelas abaixo são tabelas Delta materializadas (recriadas com `CREATE OR REPLACE TABLE`), traduzidas para `pt-BR`, sem PII, sem lucro/margem e sem colunas/textos que mencionem simulação.

### 3.1 `silver.consumo_pedidos`
- **Gerada por:** [`pipeline/notebooks/02e_silver_view_consumo.sql`](pipeline/notebooks/02e_silver_view_consumo.sql)
- **Fontes diretas:** `silver.pedidos_rastreio`, `silver.rastreio_pedidos`, `silver.consumo_eventos_logisticos`, `silver.dim_traducao`
- **Propósito:** Tabela principal de consulta para o **Agente de IA / RAG** (possui `delta.enableChangeDataFeed = true` para indexação no Vector Search) e para a visão resumida do **Portal de Rastreamento**. Reúne em uma única tabela situação atual, despacho, entrega, posição atual, lista de itens, linha do tempo e o texto pronto `resumo_pedido`.
- **Grão:** 1 linha por pedido (`id_pedido`, 65.752 linhas).
- **Chave / Segurança:** chave primária `id_pedido`; filtrar sempre por `id_cliente` no atendimento ao cliente.

| Coluna | Tipo | Origem | Descrição / Valores |
|---|---|---|---|
| `id_pedido` | `INT` | Real | Identificador único do pedido (código de rastreio). |
| `id_cliente` | `INT` | Real | Identificador do cliente (usar como filtro de acesso no portal/IA). |
| `segmento_cliente` | `STRING` | Real | Segmento comercial (`Consumer`, `Corporate`, `Home Office`). |
| `data_pedido` | `TIMESTAMP` | Real | Data e hora em que o pedido foi realizado. |
| `situacao_pedido` | `STRING` | Derivado / Simulado | Situação consolidada na data `D`: `Entregue no prazo`, `Entregue com atraso`, `Em trânsito`, `Extraviado`, `Aguardando pagamento`, `Não pago (expirado)`, `Cancelado` (ou `Despachado` em piloto parcial). |
| `data_referencia_base` | `DATE` | Derivado | Data de referência `D` da base (`2018-02-06`). |
| `modo_envio` | `STRING` | Real + De-para | Modalidade contratada traduzida via `dim_traducao`: `Expresso (despacho no mesmo dia)`, `Prioritário (despacho em 1 dia)`, `Rápido (despacho em 2 dias)`, `Padrão (despacho em 4 dias)`. |
| `modal_transporte` | `STRING` | Premissa / Simulado | Modal atribuído pós-despacho (`Aéreo expresso`, `Aéreo consolidado`, `Rodoviário`); `NULL` se não despachado. |
| `tipo_rota` | `STRING` | Derivado | `Doméstica` (destino EUA) ou `Internacional`. |
| `mercado_logistico` | `STRING` | Real | Mercado original (`USCA`, `LATAM`, `Europe`, `Pacific Asia`, `Africa`). |
| `origem_cliente_pais` | `STRING` | Real + De-para | País da loja de origem em pt-BR (`Estados Unidos`, `Porto Rico`). |
| `origem_cliente_estado` | `STRING` | Real + De-para | Estado da loja de origem em pt-BR. |
| `origem_cliente_cidade` | `STRING` | Real + De-para | Cidade da loja de origem em pt-BR. |
| `destino_pais` | `STRING` | Real + De-para | País de destino traduzido para pt-BR. |
| `destino_estado` | `STRING` | Real + De-para | Estado/província de destino traduzido para pt-BR. |
| `destino_cidade` | `STRING` | Real + De-para | Cidade de destino traduzida para pt-BR. |
| `destino_regiao` | `STRING` | Real + De-para | Região geográfica de destino traduzida para pt-BR. |
| `prazo_despacho_dias` | `INT` | Real | Prazo prometido até o despacho em dias (`0`, `1`, `2` ou `4`). |
| `dias_ate_despacho` | `INT` | Real | Dias reais entre pedido e despacho (`NULL` para não despachados/cancelados). |
| `data_despacho_prevista` | `DATE` | Real / Derivado | `data_pedido + prazo_despacho_dias` (`NULL` para não despachados). |
| `data_despacho_real` | `DATE` | Real | Data real do despacho (`NULL` para não despachados). |
| `status_prazo_despacho` | `STRING` | Derivado | `Adiantado`, `No Prazo`, `Atrasado`, `Não Avaliado`, `Cancelado`. |
| `flag_atraso_despacho` | `INT` | Derivado | `1` se `dias_ate_despacho > prazo_despacho_dias`, `0` se no prazo/adiantado, `NULL` se não avaliado. |
| `dias_atraso_despacho` | `INT` | Derivado | `dias_ate_despacho - prazo_despacho_dias` (`NULL` se não avaliado). |
| `causa_atraso_despacho` | `STRING` | Derivado | `Sem atraso`, `Promessa irreal` (prazo prometido ≤ 1 dia), `Atraso operacional`, ou `NULL`. |
| `data_entrega_prevista` | `DATE` | Premissa / Simulado | `data_despacho_prevista + transito_padrao_dias` (`NULL` se não despachado). |
| `data_entrega_realizada` | `DATE` | Simulado | `data_despacho_real + transito_real_dias` (`NULL` se não entregue, extraviado ou em trânsito). |
| `flag_atraso_entrega` | `INT` | Simulado | `1` se entrega atrasada (ou em trânsito além da previsão em `D`), `0` caso contrário, `NULL` se não aplicável. |
| `dias_atraso_entrega` | `INT` | Simulado | Diferença em dias entre realizada e prevista (ou atraso acumulado até `D` se em trânsito). |
| `causa_atraso_entrega` | `STRING` | Simulado | `Sem atraso`, `Volume sem atualização de rastreio`, `Atraso no despacho não recuperado no transporte`, ou `NULL`. |
| `etapa_extravio` | `STRING` | Simulado | Descrição da etapa onde ocorreu o extravio (ex.: `3 - Alfândega`), `NULL` se não extraviado. |
| `etapa_atual_desc` | `STRING` | Simulado | Última etapa registrada (`1 - Coleta` a `5 - Última milha`), `NULL` se não despachado. |
| `local_atual` | `STRING` | Simulado | Localização textual do último evento logístico, `NULL` se não despachado. |
| `ultimo_evento_desc` | `STRING` | Real / Simulado | Descrição do último evento da jornada do pedido. |
| `ts_ultimo_evento` | `TIMESTAMP` | Real / Simulado | Data/hora do último evento da jornada do pedido. |
| `motivo_ocorrencia` | `STRING` | Derivado + Simulado | Explicação textual consolidada (despacho + transporte/extravio) em linguagem operacional. |
| `rota_servico` | `STRING` | Derivado | Concatenação `mercado_pt - destino_regiao - modo_envio`. |
| `qtd_itens` | `INT` | Real | Soma de `quantidade_item` dos itens do pedido. |
| `lista_itens` | `STRING` | Real | Lista formatada ordenada por `id_item_pedido` (ex.: `1x Caiaque, 2x Polo`). |
| `valor_total_pedido` | `DOUBLE` | Real | Soma de `valor_item_pedido` (valor líquido após desconto). |
| `linha_do_tempo` | `STRING` | Real + Simulado | Resumo cronológico em uma linha separado por ` · ` (`dd/MM/yyyy evento (local)`). |
| `resumo_pedido` | `STRING` | Derivado + Simulado | Texto pronto em linguagem natural para respostas da IA e busca semântica (RAG). |

---

### 3.2 `silver.consumo_itens_pedido`
- **Gerada por:** [`pipeline/notebooks/02e_silver_view_consumo.sql`](pipeline/notebooks/02e_silver_view_consumo.sql)
- **Fonte direta:** `silver.pedidos_rastreio`
- **Propósito:** Detalhamento de produtos, quantidades e valores por item para exibição no **Portal FullStack** (e eventual consulta detalhada da IA). Exclui lucro, margem, PII e colunas internas.
- **Grão:** 1 linha por item de pedido (`id_item_pedido`, 180.519 linhas).

| Coluna | Tipo | Origem | Descrição |
|---|---|---|---|
| `id_item_pedido` | `INT` | Real | Identificador único do item no pedido (chave primária). |
| `id_pedido` | `INT` | Real | Chave de junção com `silver.consumo_pedidos`. |
| `id_cliente` | `INT` | Real | Identificador do cliente dono do pedido. |
| `id_produto` | `INT` | Real | Identificador do produto (`Product Card Id`). |
| `nome_produto` | `STRING` | Real | Nome do produto (original DataCo). |
| `categoria_produto` | `STRING` | Real | Categoria do produto. |
| `departamento` | `STRING` | Real | Departamento do produto. |
| `quantidade_item` | `INT` | Real | Quantidade comprada do item. |
| `preco_unitario` | `DOUBLE` | Real | Preço unitário praticado na venda (`Order Item Product Price`). |
| `valor_bruto_venda` | `DOUBLE` | Real | Valor bruto do item (`Sales`). |
| `valor_desconto` | `DOUBLE` | Real | Desconto aplicado ao item (`Order Item Discount`). |
| `valor_item_pedido` | `DOUBLE` | Real | Valor líquido do item após desconto (`Order Item Total`). |

---

### 3.3 `silver.consumo_eventos_logisticos`
- **Gerada por:** [`pipeline/notebooks/02i_silver_consolidacao_rastreio.sql`](pipeline/notebooks/02i_silver_consolidacao_rastreio.sql)
- **Fontes diretas:** `silver.eventos_logisticos`, `silver.simulacao_publicada`, `silver.pedidos_rastreio`, `silver.dim_traducao`
- **Propósito:** Linha do tempo detalhada de eventos de rastreamento para a tela de histórico do **Portal FullStack** (e detalhamento opcional na IA). Filtra apenas a fatia publicada em `silver.simulacao_publicada` e omite metadados de simulação (`dado_simulado`, `versao`, `escopo`).
- **Grão:** 1 linha por evento do pedido (`id_pedido` + `sequencia`, ~350.416 linhas na execução completa).

| Coluna | Tipo | Origem | Descrição |
|---|---|---|---|
| `id_pedido` | `INT` | Real | Identificador do pedido. |
| `id_cliente` | `INT` | Real | Identificador do cliente (filtro de segurança). |
| `sequencia` | `INT` | Derivado | Ordem cronológica contínua do evento no pedido (`1, 2, ...`). |
| `codigo_evento` | `STRING` | Real / Simulado | `PEDIDO_CRIADO`, `PEDIDO_DESPACHADO` (reais) ou `COLETA_GATEWAY`, `PARTIDA_VOO`, `CHEGADA_ALFANDEGA`, `LIBERACAO_ALFANDEGA`, `CHEGADA_CD`, `CHEGADA_ARMAZEM`, `SAIU_PARA_ENTREGA`, `ENTREGUE`, `EXTRAVIO_CONFIRMADO` (simulados). |
| `descricao_evento` | `STRING` | Real / Simulado | Descrição legível do evento em pt-BR. |
| `etapa` | `INT` | Derivado / Simulado | Código numérico da etapa (`0` a `5`). |
| `etapa_desc` | `STRING` | Derivado / Simulado | `0 - Pedido`, `1 - Coleta`, `2 - Voo`, `3 - Alfândega`, `4 - Transferência`, `5 - Última milha`. |
| `ts_evento` | `TIMESTAMP` | Real / Simulado | Timestamp do evento (sempre `<= D`). |
| `id_hub` | `STRING` | Simulado | Identificador do hub (`silver.dim_hubs`); `NULL` para criação, despacho e entrega final. |
| `local_evento` | `STRING` | Real / Simulado | Localização textual do evento. |
| `ultimo_evento` | `BOOLEAN` | Derivado | `TRUE` para o último evento registrado do pedido até `D`. |
| `tipo_rota` | `STRING` | Derivado | `Doméstica` ou `Internacional`. |
| `modal_transporte` | `STRING` | Premissa / Simulado | `Aéreo expresso`, `Aéreo consolidado`, `Rodoviário` (ou `NULL` se não despachado). |
| `modo_envio` | `STRING` | Real + De-para | Modalidade traduzida via `silver.dim_traducao`. |
| `destino_regiao` | `STRING` | Real | Região de destino original (`Order Region`). |

---

## 4. Camada Gold — Tabelas OBT e Views (`gold.obt_*`, `gold.vw_*`, `gold.param_*`)

Todos os objetos analíticos da Gold são criados em [`pipeline/notebooks/03c_gold_obt.sql`](pipeline/notebooks/03c_gold_obt.sql) e validados por [`pipeline/notebooks/03d_gold_validacao.sql`](pipeline/notebooks/03d_gold_validacao.sql).
**Escopo obrigatório da Gold:** somente os **36.866 pedidos despachados** (`avaliado_prazo = TRUE`). Pedidos aguardando pagamento, expirados e cancelados ficam fora do escopo logístico.

### 4.1 `gold.obt_pedidos_logistica`
- **Gerada por:** [`pipeline/notebooks/03c_gold_obt.sql`](pipeline/notebooks/03c_gold_obt.sql)
- **Fontes diretas:** `silver.pedidos_rastreio`, `silver.rastreio_pedidos`, `silver.dim_traducao`, `gold_pais_mapa` (CTE interna)
- **Propósito:** One Big Table (OBT) principal no grão de pedido despachado para KPIs executivos de despacho (real), entrega/extravio (simulado), recuperação no transporte e impacto financeiro.
- **Grão:** 1 linha por pedido despachado (`id_pedido`, 36.866 linhas).

| Grupo | Coluna | Tipo | Origem | Descrição |
|---|---|---|---|---|
| Chaves | `id_pedido` | `INT` | Real | Chave primária do pedido despachado. |
| | `id_cliente` | `INT` | Real | Identificador do cliente (sem PII). |
| Tempo | `data_pedido` | `DATE` | Real | Data do pedido. |
| | `mes_pedido` | `DATE` | Real | Primeiro dia do mês do pedido (`DATE_TRUNC('month', data_pedido)`). |
| | `ano`, `trimestre`, `mes_num` | `INT` | Real | Recortes de calendário do pedido. |
| | `data_despacho_real` | `DATE` | Real | Data do despacho (`Shipping date`). |
| | `data_referencia_base` | `DATE` | Derivado | Data de corte `D` (`2018-02-06`). |
| | `fl_periodo_parcial` | `INT` | Derivado | `1` se `data_pedido >= 2018-01-01` ou `situacao_entrega = 'Em trânsito'`. |
| Cliente/Prod. | `segmento_cliente` | `STRING` | Real | `Consumer`, `Corporate`, `Home Office`. |
| | `qtd_itens`, `qtd_unidades` | `BIGINT` | Real | Quantidade de linhas de item e soma de unidades do pedido. |
| | `categoria_principal`, `departamento_principal` | `STRING` | Real | Categoria e departamento do item de maior `valor_bruto_venda` no pedido. |
| Serviço/Rota | `classe_servico` | `STRING` | Real | Classe original (`Same Day`, `First Class`, `Second Class`, `Standard Class`), usada como chave de cenário em `gold.param_cenario_prazo`. |
| | `modo_envio` | `STRING` | Real + De-para | Modalidade traduzida para pt-BR via `silver.dim_traducao` (`Expresso (despacho no mesmo dia)`, etc.). |
| | `prazo_despacho_prometido` | `INT` | Real | Prazo prometido de despacho (`0`, `1`, `2` ou `4` dias). |
| | `prazo_despacho_sugerido` | `INT` | Regra (S1) | Prazo sugerido ("Promessa ajustada"): Same Day `1`, First `2`, Second `4`, Standard `4`. |
| | `modal_transporte` | `STRING` | Simulado | `Aéreo expresso`, `Aéreo consolidado` ou `Rodoviário`. |
| | `tipo_rota`, `mercado_logistico` | `STRING` | Real / Derivado | Tipo de rota e mercado de destino. |
| | `destino_regiao` | `STRING` | Real + De-para | Região geográfica de destino traduzida para pt-BR via `silver.dim_traducao`. |
| | `destino_pais` | `STRING` | Real + De-para | País de destino traduzido para pt-BR via `silver.dim_traducao`. |
| | `destino_pais_en`, `destino_pais_iso3` | `STRING` | De-para | País em inglês e código ISO 3166-1 alfa-3 (para mapas). |
| | `destino_estado`, `destino_cidade` | `STRING` | Real + De-para | Estado e cidade de destino traduzidos para pt-BR via `silver.dim_traducao`. |
| Situação | `situacao_pedido` | `STRING` | Simulado / Derivado | `COALESCE(situacao_entrega, situacao_pedido_rastreio)`: `Entregue no prazo`, `Entregue com atraso`, `Extraviado`, `Em trânsito` (ou `Despachado` sem simulação). |
| | `fl_com_desfecho` | `INT` | Simulado | `1` para entregues ou extraviados (denominador das taxas de entrega/extravio). |
| | `fl_em_transito` | `INT` | Simulado | `1` para pedidos sem desfecho até `D`. |
| Despacho | `dias_ate_despacho` | `INT` | Real | Dias reais do pedido até o despacho (`dias_envio_real`). |
| | `fl_despacho_atrasado` | `INT` | Real | `1` se despacho ocorreu após o prazo prometido. |
| | `dias_atraso_despacho` | `INT` | Real | Dias de atraso no despacho (preenchido só quando `fl_despacho_atrasado = 1`). |
| | `status_prazo_despacho` | `STRING` | Real | `Adiantado`, `No Prazo` ou `Atrasado`. |
| | `causa_atraso_despacho` | `STRING` | Real | `Sem atraso`, `Promessa irreal` ou `Atraso operacional`. |
| | `fl_despacho_atrasado_prazo_sugerido` | `INT` | Real + Regra | `1` se `dias_ate_despacho > prazo_despacho_sugerido` (cenário S1). |
| | `fl_despacho_acima_4_dias` | `INT` | Real | `1` se `dias_ate_despacho > 4` (meta S2). |
| Entrega | `transito_padrao_dias`, `transito_real_dias` | `INT` | Simulado | Trânsito padrão `T` e trânsito efetivo na simulação (dias). |
| | `dias_recuperados_transporte` | `INT` | Simulado | Dias de atraso no despacho absorvidos no transporte. |
| | `resultado_transporte` | `STRING` | Simulado | `No prazo`, `Recuperou o atraso do despacho`, `Não recuperou o atraso do despacho`, `Extraviado`, `Em trânsito`. |
| | `data_entrega_prevista`, `data_entrega_realizada` | `DATE` | Simulado | Datas prevista e realizada de entrega (`NULL` em extraviados/em trânsito). |
| | `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `fl_extraviado` | `INT` | Simulado | Flags `0/1` de desfecho de entrega. |
| | `fl_despacho_atrasado_entregue` | `INT` | Simulado | `1` se despacho atrasou e pedido foi entregue (denominador da taxa de recuperação). |
| | `fl_recuperou_atraso` | `INT` | Simulado | `1` se `resultado_transporte = 'Recuperou o atraso do despacho'`. |
| | `dias_atraso_entrega` | `INT` | Simulado | Atraso na entrega apenas em `Entregue com atraso` (`NULL` nos demais). |
| | `dias_diferenca_entrega` | `INT` | Simulado | `realizada - prevista` em todo pedido entregue (negativo = adiantado). |
| | `dias_atraso_ate_d` | `INT` | Simulado | Atraso acumulado até `D` para pedidos `Em trânsito` (fora dos KPIs). |
| | `etapa_extravio`, `etapa_extravio_num` | `STRING` / `INT` | Simulado | Etapa (descrição e número `1..5`) onde ocorreu o extravio. |
| Financeiro | `receita_bruta_pedido`, `receita_liquida_pedido`, `lucro_pedido` | `DOUBLE` | Real | Soma por pedido de `valor_bruto_venda`, `valor_item_pedido` e `lucro_item`. |
| | `receita_bruta_em_risco`, `receita_liquida_em_risco`, `lucro_em_risco` | `DOUBLE` | Simulado s/ real | Valores do pedido quando entregue com atraso ou extraviado; `0` nos demais. |
| | `receita_bruta_extraviada`, `receita_liquida_extraviada`, `lucro_extraviado` | `DOUBLE` | Simulado s/ real | Valores do pedido quando extraviado; `0` nos demais. |
| Linhagem | `origem_dado_despacho`, `origem_dado_entrega`, `rotulo_fonte`, `dt_processamento_gold` | `STRING` / `TIMESTAMP` | Metadado | Identificação explícita de origem real (`despacho`) vs. simulada (`simulado`), sem rastreio (`sem_dado`) ou real (`entrega`). |

---

### 4.2 `gold.obt_itens_risco`
- **Gerada por:** [`pipeline/notebooks/03c_gold_obt.sql`](pipeline/notebooks/03c_gold_obt.sql)
- **Fontes diretas:** `gold_base_itens` (`silver.pedidos_rastreio` filtrado para despachados) + `gold.obt_pedidos_logistica`
- **Propósito:** Análise de **receita e lucro em risco por departamento, categoria e produto** (um pedido pode conter itens de categorias distintas). Não deve ser usada para calcular taxas de atraso/extravio (flags repetidas do pedido). *Observação: não está conectada ao dashboard atual (`translog_gold.lvdash.json`), estando disponível para análises ad-hoc ou futuras páginas de BI.*
- **Grão:** 1 linha por item de pedido despachado (`id_item_pedido`, 101.009 linhas).

| Grupo | Colunas | Descrição |
|---|---|---|
| Chaves | `id_item_pedido`, `id_pedido`, `id_produto` | Identificadores do item, pedido e produto. |
| Produto | `departamento`, `categoria_produto`, `nome_produto`, `quantidade_item`, `preco_unitario` | Hierarquia e quantidade/preço do item (real). |
| Financeiro do item | `receita_bruta_item`, `desconto_item`, `receita_liquida_item`, `lucro_item` | Valores reais do item (`valor_bruto_venda`, `valor_desconto`, `valor_item_pedido`, `lucro_item`). |
| Risco do item | `receita_bruta_em_risco`, `receita_liquida_em_risco`, `lucro_em_risco`, `receita_bruta_extraviada`, `receita_liquida_extraviada`, `lucro_extraviado` | Valores reais do item atribuídos ao risco/extravio conforme desfecho simulado do pedido (`0` caso contrário). |
| Contexto do pedido | `situacao_pedido`, `fl_com_desfecho`, `fl_em_transito`, `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `fl_extraviado`, `fl_despacho_atrasado`, `causa_atraso_despacho`, `etapa_extravio`, `classe_servico`, `modo_envio`, `modal_transporte`, `tipo_rota`, `mercado_logistico`, `destino_regiao`, `destino_pais`, `destino_pais_en`, `destino_pais_iso3`, `segmento_cliente`, `data_pedido`, `mes_pedido`, `ano`, `fl_periodo_parcial` | Atributos herdados de `gold.obt_pedidos_logistica` para filtro/corte (não usar `fl_*` para taxa neste grão). |
| Rótulos | `origem_dado_despacho`, `origem_dado_entrega`, `rotulo_fonte`, `dt_processamento_gold` | Metadados de origem real × simulada e timestamp Gold. |

---

### 4.3 `gold.obt_eventos_etapas`
- **Gerada por:** [`pipeline/notebooks/03c_gold_obt.sql`](pipeline/notebooks/03c_gold_obt.sql)
- **Fontes diretas:** `silver.consumo_eventos_logisticos` + `gold.obt_pedidos_logistica`
- **Propósito:** Análise de gargalos, tempo de permanência e concentração de extravios por etapa logística (`0` a `5`). Alimenta os gráficos de extravio por etapa no dashboard AI/BI (`ds_etapas`).
- **Grão:** 1 linha por pedido despachado × etapa percorrida (`id_pedido` + `etapa_num`, 201.635 linhas).

| Coluna | Tipo | Origem | Descrição |
|---|---|---|---|
| `id_pedido`, `etapa_num`, `etapa_desc` | `INT` / `STRING` | Real / Simulado | Chave composta: pedido e etapa (`0 - Pedido` a `5 - Última milha`). |
| `qtd_eventos` | `BIGINT` | Derivado | Quantidade de eventos na etapa. |
| `primeiro_codigo_evento`, `ultimo_codigo_evento` | `STRING` | Real / Simulado | Códigos do primeiro e último evento dentro da etapa. |
| `entrada_etapa`, `saida_etapa` | `TIMESTAMP` | Real / Simulado | Entrada da etapa e entrada da próxima etapa (ou desfecho; `NULL` se em trânsito na última etapa). |
| `horas_na_etapa` | `DOUBLE` | Real (`0`) / Simulado (`1..5`) | Permanência em horas (`NULL` na etapa de extravio e na etapa atual em trânsito). |
| `fl_etapa_concluida` | `INT` | Derivado | `1` se houve saída para próxima etapa ou `ENTREGUE`. |
| `fl_extravio_nesta_etapa` | `INT` | Simulado | `1` na etapa em que ocorreu `EXTRAVIO_CONFIRMADO`. |
| `fl_etapa_atual` | `INT` | Simulado | `1` na etapa atual de pedidos `Em trânsito`. |
| `id_hub`, `local_evento` | `STRING` | Simulado | Primeiro hub/local da etapa (`silver.dim_hubs`). |
| `origem_dado` | `STRING` | Metadado | `'real'` na etapa `0`, `'simulado'` nas etapas `1..5`. |
| Dimensões do pedido | Vários | Real / Simulado | `situacao_pedido`, `fl_com_desfecho`, `fl_extraviado`, `fl_despacho_atrasado`, `classe_servico`, `modo_envio`, `modal_transporte`, `tipo_rota`, `mercado_logistico`, `destino_regiao`, `destino_pais`, `destino_pais_en`, `destino_pais_iso3`, `mes_pedido`, `ano`, `fl_periodo_parcial`. |
| `receita_bruta_pedido` | `DOUBLE` | Real | Repetida por etapa (**não somar diretamente**). |
| `receita_bruta_extraviada_nesta_etapa`, `receita_liquida_extraviada_nesta_etapa`, `lucro_extraviado_nesta_etapa` | `DOUBLE` | Simulado s/ real | Preenchidas apenas na etapa do extravio (`0` nas demais; podem ser somadas diretamente). |
| `rotulo_fonte`, `dt_processamento_gold` | `STRING` / `TIMESTAMP` | Metadado | Rótulo de origem e timestamp de geração. |

---

### 4.4 `gold.param_cenario_prazo` e `gold.vw_cenarios_prazo`
- **Gerados por:** [`pipeline/notebooks/03c_gold_obt.sql`](pipeline/notebooks/03c_gold_obt.sql)
- **`gold.param_cenario_prazo` (Tabela Delta editável):** armazena parâmetros de cenários alternativos de prazo de despacho por `classe_servico`. Criada com `CREATE TABLE IF NOT EXISTS` e populada via `MERGE` idempotente (apenas `WHEN NOT MATCHED`), preservando edições manuais. Seed inicial: cenário `'Promessa ajustada'` (`ordem_cenario = 2`: `First Class = 2`, `Same Day = 1`, `Second Class = 4`, `Standard Class = 4`).
  - Colunas: `cenario`, `ordem_cenario`, `classe_servico`, `prazo_despacho_dias`, `criterio`, `ativo`, `dt_atualizacao`.
- **`gold.vw_cenarios_prazo` (View SQL):** cruza `gold.obt_pedidos_logistica` com `'Promessa atual'` (`ordem_cenario = 1`) e os cenários ativos de `gold.param_cenario_prazo`, recalculando a régua de atraso em tempo de consulta mantendo fixas as datas reais de despacho e entrega. Alimenta 6 dos 7 datasets do dashboard AI/BI (`translog_gold.lvdash.json`).
- **Grão da `gold.vw_cenarios_prazo`:** 1 linha por pedido despachado × cenário (`id_pedido` + `cenario`, 73.732 linhas com 2 cenários).

| Grupo | Colunas específicas da view | Descrição |
|---|---|---|
| Cenário | `cenario`, `ordem_cenario` | Nome e ordenação do cenário (`1 = Promessa atual`, `2 = Promessa ajustada`, etc.). Sempre filtrar ou agrupar por `cenario`. |
| Régua | `prazo_despacho_prometido`, `prazo_despacho_cenario`, `ajuste_prazo_dias` | Prazo original, prazo aplicado no cenário e diferença em dias (`prazo_cenario - prometido`). |
| Despacho (recalculado) | `dias_ate_despacho`, `fl_despacho_atrasado`, `dias_atraso_despacho`, `fl_despacho_acima_4_dias` | `dias_ate_despacho` permanece real; flags/dias de atraso usam `prazo_despacho_cenario` como régua. |
| Entrega (recalculada) | `situacao_pedido`, `fl_com_desfecho`, `fl_em_transito`, `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `fl_extraviado`, `dias_atraso_entrega`, `data_entrega_prevista`, `data_entrega_realizada` | Extravio e em trânsito não mudam; entregas são reavaliadas contra a nova data prevista (`data_entrega_prevista + ajuste_prazo_dias`). |
| Valor (recalculado) | `receita_bruta_pedido`, `receita_liquida_pedido`, `lucro_pedido`, `receita_bruta_atrasada`, `lucro_atrasado`, `receita_bruta_em_risco`, `receita_liquida_em_risco`, `lucro_em_risco`, `receita_bruta_extraviada`, `lucro_extraviado` | `receita_bruta_atrasada` e `lucro_atrasado` medem apenas entregas atrasadas (sem extravios); `*_em_risco` soma entregas atrasadas + extravios no cenário. |
| Dimensões e rótulos | `id_pedido`, `classe_servico`, `modo_envio`, `mes_pedido`, `ano`, `trimestre`, `fl_periodo_parcial`, `tipo_rota`, `modal_transporte`, `mercado_logistico`, `destino_regiao`, `destino_pais`, `destino_pais_en`, `destino_pais_iso3`, `destino_estado`, `destino_cidade`, `etapa_extravio`, `origem_dado_despacho`, `origem_dado_entrega`, `rotulo_fonte` | Mesmas definições de `gold.obt_pedidos_logistica`. |

---

## 5. Tabelas Internas e Fluxo de Geração de Dados Sintéticos

### 5.1 Tabelas internas (Bronze e Silver intermediária)
| Objeto | Gerado por | Grão | Papel |
|---|---|---|---|
| `bronze.dataco_raw` | `01_bronze_ingestao.sql` | Item | Dados brutos do `DataCoSupplyChainDataset.csv` (53 colunas originais + `_rescued_data`, `dt_ingestao_bronze`, `arquivo_origem`). |
| `silver.dim_traducao` | `01b_silver_dim_traducao.sql` | Termo | De-para `pt-BR` (5.581 linhas: `de_para.csv` + 4 modalidades de `modo_envio`). |
| `silver.pedidos_rastreio` | `02a_silver_tratamento_rotas_atrasos.sql` | Item | Silver interna limpa e enriquecida (inclui `nome_cliente`, colunas originais e flags internas). |
| `silver.pedidos_quarentena` | `02a_silver_tratamento_rotas_atrasos.sql` | Item | Registros reprovados na qualidade (`0` linhas no dataset atual). |
| `silver.dim_hubs` | `02d_silver_rastreio_simulado.sql` | Hub | Malha simulada derivada dos dados: 5 `GATEWAY_ORIGEM`, 164 `CD_NACIONAL`, 163 `ALFANDEGA`, até 3 `ARMAZEM_ESTADUAL` por país. |
| `silver.eventos_logisticos` | `02g_silver_geracao_eventos.py` | Evento × fatia | Histórico de eventos reais (`PEDIDO_CRIADO`, `PEDIDO_DESPACHADO`) e simulados pós-despacho, particionado por `cenario`, `versao`, `escopo`. |
| `silver.entregas_simuladas` | `02g_silver_geracao_eventos.py` | Pedido × fatia | Resultado simulado de entrega, datas, recuperação e extravio por `cenario`, `versao`, `escopo`. |
| `silver.eventos_logisticos_quarentena` | `02g_silver_geracao_eventos.py` | Pedido × fatia | Pedidos que falharam em pré-requisitos ou consistência temporal da simulação. |
| `silver.simulacao_publicada` | `02g_silver_geracao_eventos.py` | 1 linha | Ponteiro `(cenario, versao, escopo)` da fatia ativa lida por `02i`. |
| `silver.rastreio_pedidos` | `02i_silver_consolidacao_rastreio.sql` | Pedido | Consolidação da fatia publicada (último evento + entrega + `motivo_ocorrencia` + `dado_simulado`). |

### 5.2 Como os dados sintéticos de despacho e entrega são gerados
1. **Despacho (real, não sintético no pipeline):** o pipeline lê as colunas reais do DataCo (`order date`, `shipping date`, `Days for shipment (scheduled)`, `Days for shipping (real)`) em `02a` e calcula `flag_atraso_despacho`, `dias_atraso_despacho` e `causa_atraso_despacho` apenas para pedidos pagos e despachados (`COMPLETE`, `CLOSED`, `PROCESSING`).
2. **Malha física simulada (`02d`):** constrói `silver.dim_hubs` com 5 gateways fixos nos EUA/Porto Rico e CDs, alfândegas e armazéns estaduais derivados do volume de pedidos por país/estado.
3. **Preparação (`02f`, chamada via `%run` pelo `02g`):** extrai 1 linha por pedido de `silver.pedidos_rastreio` (enviando pedidos com itens divergentes para quarentena), classifica `grupo_status` (`despachado`, `aguardando`, `nao_pago`, `cancelado`), atribui `modal_transporte` (`Aéreo expresso`, `Rodoviário`, `Aéreo consolidado`), vincula os hubs e seleciona o escopo (`piloto` estratificado ou `completo`).
4. **Geração determinística de eventos e desfechos (`02g`):**
   - Calcula o trânsito padrão `T` por rota, modal e mercado (1 a 8 dias).
   - Calibra sobre toda a base despachada a probabilidade `p_nao_recuperado` para que os pedidos concluídos fechem em **60% no prazo / 20% com atraso / 20% extraviados**.
   - Sorteia via `pmod(xxhash64(id_pedido, salt), N)` o extravio (20%), a etapa de extravio (pesos por rota; internacional concentra na alfândega) e a recuperação de atraso do despacho (encurtando o trânsito real até o mínimo de 1 dia).
   - Distribui timestamps intermediários por pesos relativos dos trechos (±30% por hash) a partir de `data_envio` e aplica o **corte temporal em `D`** (`data_referencia_base`): eventos posteriores a `D` são cortados e o pedido permanece como `Em trânsito`.
   - Grava as tabelas de simulação de forma idempotente (`replaceWhere` por `cenario`, `versao`, `escopo`) e atualiza `silver.simulacao_publicada`.
5. **Consolidação e higienização para consumo (`02i` e `02e`):** `02i` consolida a posição pelo último evento publicado (`silver.rastreio_pedidos`) e cria `silver.consumo_eventos_logisticos`; `02e` gera `silver.consumo_pedidos` e `silver.consumo_itens_pedido`, removendo todas as flags de simulação para consumo pelo Portal e pela IA.

