# Queries e Data Model da Gold (`dashboard_v2`)

> **Dashboard:** `dashboard_v2` (ID: `01f1e431058219bdbc65bf2d1d94947a` · Workspace: `/Workspace/translog-dev/dashboard/dashboard_v2.lvdash.json` · Warehouse: `8dc0032aceb1a0d9`)  
> **Revisão sincronizada:** `2026-11-22T15:09:36.271Z`  
> **Recortes padronizados:**  
> - **Contexto e Despacho (`36.866` pedidos pagos e despachados):** sem filtro `fl_com_desfecho = 1`.  
> - **Desfecho Final (`36.671` pedidos finalizados):** `WHERE fl_com_desfecho = 1` (exclui os 195 em trânsito).  
> - **Cenário recomendado (Abas 4 e 5):** **Regra `S1` (Prazo honesto)** — `Same Day +1 (1d)`, `First Class +1 (2d)`, `Second Class +2 (4d)`, `Standard Class +0 (4d)`.

---

## 1. Tabelas e Views Diretas do Data Model (aba `Data`)

| Dataset (`displayName`) | ID (`name`) | Objeto Databricks (`config.source`) | Widgets conectados |
|---|---|---|---|
| `obt_eventos_etapas` | `326c2a23` | `workspace.gold.obt_eventos_etapas` | — *(referência no modelo)* |
| `obt_itens_risco` | `695bd7dd` | `workspace.gold.obt_itens_risco` | — *(referência no modelo)* |
| `obt_pedidos_logistica` | `9af6ac2d` | `workspace.gold.obt_pedidos_logistica` | — *(referência no modelo)* |
| `vw_cenarios_prazo` | `add51d67` | `workspace.gold.vw_cenarios_prazo` | — *(referência no modelo)* |
| `param_cenario_prazo` | `dadc907e` | `workspace.gold.param_cenario_prazo` | — *(referência no modelo)* |

---

## 2. Queries SQL Ativas por Aba

### Aba 1 — `1 - Contexto da Operação`

#### `ds_contexto_kpis` (`52894890`)
* **Widgets:** `Pedidos pagos e despachados`, `Receita Bruta Total`, `Países Atendidos`, `Ticket Médio`
```sql
SELECT
  COUNT(DISTINCT id_pedido) AS total_pedidos,
  ROUND(SUM(receita_bruta_pedido), 2) AS receita_total,
  COUNT(DISTINCT destino_pais_pt) AS total_paises,
  ROUND(SUM(receita_bruta_pedido) / NULLIF(COUNT(DISTINCT id_pedido), 0), 2) AS ticket_medio
FROM workspace.gold.obt_pedidos_logistica;
```

#### `ds_contexto_mercados` (`2223fecd`)
* **Widgets:** `Receita por mercado logístico`
```sql
SELECT
  mercado_logistico,
  destino_regiao,
  COUNT(DISTINCT id_pedido) AS total_pedidos,
  ROUND(SUM(receita_bruta_pedido), 2) AS receita_total
FROM workspace.gold.obt_pedidos_logistica
GROUP BY mercado_logistico, destino_regiao
ORDER BY receita_total DESC;
```

#### `ds_contexto_categorias` (`0d25e4af`)
* **Widgets:** `Receita por categoria principal` *(Top 10 categorias + `'Others'`)*
```sql
WITH base_categorias AS (
  SELECT
    departamento_principal,
    categoria_principal,
    COUNT(DISTINCT id_pedido) AS total_pedidos,
    SUM(receita_bruta_pedido) AS receita_bruta,
    ROW_NUMBER() OVER (ORDER BY SUM(receita_bruta_pedido) DESC) AS rn
  FROM workspace.gold.obt_pedidos_logistica
  WHERE fl_com_desfecho = 1
  GROUP BY departamento_principal, categoria_principal
)
SELECT
  CASE WHEN rn <= 10 THEN departamento_principal ELSE 'Others' END AS departamento_principal,
  CASE WHEN rn <= 10 THEN categoria_principal ELSE 'Others' END AS categoria_principal,
  SUM(total_pedidos) AS total_pedidos,
  ROUND(SUM(receita_bruta), 2) AS receita_total
FROM base_categorias
GROUP BY
  CASE WHEN rn <= 10 THEN departamento_principal ELSE 'Others' END,
  CASE WHEN rn <= 10 THEN categoria_principal ELSE 'Others' END
ORDER BY
  CASE WHEN categoria_principal = 'Others' THEN 1 ELSE 0 END,
  receita_total DESC;
```

#### `ds_contexto_modalidades` (`065a095f`)
* **Widgets:** `Participação por classe de serviço`
```sql
SELECT
  classe_servico,
  COUNT(DISTINCT id_pedido) AS total_pedidos,
  ROUND(SUM(receita_bruta_pedido), 2) AS receita_total,
  ROUND(100.0 * COUNT(DISTINCT id_pedido) / SUM(COUNT(DISTINCT id_pedido)) OVER (), 1) AS pct_participacao
FROM workspace.gold.obt_pedidos_logistica
GROUP BY classe_servico
ORDER BY total_pedidos DESC;
```

---

### Aba 2 — `2 - Panorama dos atrasos`

#### `ds_extravios_kpi` (`a1b2c3d2`)
* **Widgets:** `Extravios (%) `
```sql
SELECT
  SUM(fl_extraviado) AS qtd_extraviados,
  ROUND(100.0 * AVG(fl_extraviado), 1) AS pct_extraviados,
  ROUND(SUM(receita_bruta_extraviada), 2) AS receita_extraviada
FROM workspace.gold.obt_pedidos_logistica
WHERE fl_com_desfecho = 1;
```

#### `pedido_atrasado` (`493d04b1`)
* **Widgets:** `despacho atrasado (%)` (`COUNT(*) = 36.866` → `57,3%`), `entregas atrasadas (%)` (`SUM(fl_com_desfecho) = 36.671` → `20,3%`)
```sql
SELECT
  ROUND(100.0 * SUM(fl_entregue_atrasado) / NULLIF(SUM(fl_com_desfecho), 0), 1) AS pct_atraso,
  SUM(fl_entregue_atrasado) AS qtd_pedidos_atrasados,
  ROUND(100.0 * SUM(fl_despacho_atrasado) / COUNT(*), 1) AS pct_despacho_atrasado,
  ROUND(SUM(CASE WHEN fl_entregue_atrasado = 1 THEN receita_bruta_pedido ELSE 0 END), 2) AS valor_pedidos_atrasados
FROM workspace.gold.obt_pedidos_logistica;
```

#### `timeline` (`e95c4188`)
* **Widgets:** `Linha do tempo de pedidos atrasados` e 2 histogramas com filtro temporal no widget (`d285715e`: `2016-03-01` a `2016-10-01`; `3cc08310`: `2017-09-01` a `2017-12-31`)
```sql
SELECT
  mes_pedido,
  SUM(fl_entregue_atrasado) AS qtd_pedidos_atrasados,
  SUM(fl_entregue_no_prazo) AS qtd_pedidos_no_prazo
FROM workspace.gold.obt_pedidos_logistica
WHERE fl_com_desfecho = 1
GROUP BY mes_pedido
ORDER BY mes_pedido;
```

---

### Aba 3 — `3 · Causas`

#### `etapa_gargalo` (`31b3d544`)
* **Widgets:** `Causa raiz do atraso: Despacho atrasado vs. Transporte atrasado`
```sql
WITH base AS (
  SELECT
    SUM(CASE WHEN fl_despacho_atrasado = 1 THEN 1 ELSE 0 END) AS qtd_despacho_atrasado,
    SUM(CASE WHEN transito_real_dias > transito_padrao_dias THEN 1 ELSE 0 END) AS qtd_transporte_atrasado,
    COUNT(*) AS total_atrasados
  FROM workspace.gold.obt_pedidos_logistica
  WHERE fl_entregue_atrasado = 1
)
SELECT
  'Despacho atrasado' AS causa_atraso,
  qtd_despacho_atrasado AS qtd_pedidos,
  ROUND(100.0 * qtd_despacho_atrasado / NULLIF(total_atrasados, 0), 1) AS pct_causa
FROM base
UNION ALL
SELECT
  'Transporte atrasado' AS causa_atraso,
  qtd_transporte_atrasado AS qtd_pedidos,
  ROUND(100.0 * qtd_transporte_atrasado / NULLIF(total_atrasados, 0), 1) AS pct_causa
FROM base;
```

#### `despacho_atrasado` (`30570531`)
* **Widgets:** `% de atraso no despacho por classe de serviço`
```sql
SELECT
  classe_servico,
  ROUND(100.0 * SUM(fl_despacho_atrasado) / COUNT(*), 1) AS pct_atraso
FROM workspace.gold.obt_pedidos_logistica
GROUP BY classe_servico
ORDER BY pct_atraso DESC;
```

#### `ds_ocorrencias_por_etapa` (`a1b2c3d1`)
* **Widgets:** `Gargalos na entrega final: Atrasos não recuperados e extravios por etapa`
```sql
WITH padrao AS (
  SELECT
    etapa_num,
    tipo_rota,
    modal_transporte,
    mercado_logistico,
    ROUND(AVG(horas_na_etapa), 2) AS avg_horas_padrao
  FROM workspace.gold.obt_eventos_etapas
  WHERE etapa_num > 0
    AND situacao_pedido = 'Entregue no prazo'
    AND fl_despacho_atrasado = 0
    AND horas_na_etapa IS NOT NULL
  GROUP BY etapa_num, tipo_rota, modal_transporte, mercado_logistico
)
SELECT
  e.etapa_num,
  e.etapa_desc,
  SUM(e.fl_extravio_nesta_etapa) AS qtd_extravios,
  SUM(
    CASE
      WHEN e.etapa_num = 1
       AND e.fl_despacho_atrasado = 1
       AND e.situacao_pedido = 'Entregue com atraso' THEN 1
      WHEN e.etapa_num > 1
       AND e.horas_na_etapa > (p.avg_horas_padrao + 18)
       AND e.situacao_pedido = 'Entregue com atraso'
       AND e.fl_despacho_atrasado = 0 THEN 1
      ELSE 0
    END
  ) AS qtd_atrasos
FROM workspace.gold.obt_eventos_etapas e
LEFT JOIN padrao p
  ON p.etapa_num = e.etapa_num
 AND p.tipo_rota = e.tipo_rota
 AND p.modal_transporte = e.modal_transporte
 AND p.mercado_logistico = e.mercado_logistico
WHERE e.etapa_num > 0
GROUP BY e.etapa_num, e.etapa_desc
ORDER BY e.etapa_num;
```

---

### Aba 4 — `4 · Recomendações`

#### `pct_atraso_cenario` (`efdf06ca`)
* **Widgets:** `Impacto no Atraso de DESPACHO: Cenário Atual vs. Prazo honesto`
```sql
WITH calc AS (
  SELECT
    fl_despacho_atrasado,
    CASE
      WHEN dias_ate_despacho > (
        prazo_despacho_prometido +
        CASE classe_servico
          WHEN 'Same Day'       THEN 1
          WHEN 'First Class'    THEN 1
          WHEN 'Second Class'   THEN 2
          WHEN 'Standard Class' THEN 0
          ELSE 0
        END
      ) THEN 1
      ELSE 0
    END AS fl_prazo_honesto
  FROM workspace.gold.obt_pedidos_logistica
)
SELECT
  'Cenário atual' AS cenario,
  ROUND(100.0 * AVG(fl_despacho_atrasado), 1) AS pct_atraso
FROM calc
UNION ALL
SELECT
  'Prazo honesto' AS cenario,
  ROUND(100.0 * AVG(fl_prazo_honesto), 1) AS pct_atraso
FROM calc;
```

#### `nova_premissa_despacho` (`91620631`)
* **Widgets:** `Ajuste de SLA de Despacho por Classe de Serviço — Prazo honesto`
```sql
WITH calc AS (
  SELECT
    classe_servico AS modalidade_despacho,
    prazo_despacho_prometido,
    CASE classe_servico
      WHEN 'Same Day'       THEN 1
      WHEN 'First Class'    THEN 1
      WHEN 'Second Class'   THEN 2
      WHEN 'Standard Class' THEN 0
      ELSE 0
    END AS diferenca_dias,
    dias_ate_despacho,
    fl_despacho_atrasado
  FROM workspace.gold.obt_pedidos_logistica
)
SELECT
  modalidade_despacho,
  MIN(prazo_despacho_prometido) AS prazo_prometido,
  MIN(diferenca_dias) AS diferenca_dias,
  MIN(prazo_despacho_prometido + diferenca_dias) AS prazo_realista,
  ROUND(100.0 * AVG(fl_despacho_atrasado), 1) AS pct_atraso_atual,
  ROUND(100.0 * AVG(CASE WHEN dias_ate_despacho > (prazo_despacho_prometido + diferenca_dias) THEN 1 ELSE 0 END), 1) AS pct_atraso_novo
FROM calc
GROUP BY modalidade_despacho
ORDER BY prazo_prometido;
```

---

### Aba 5 — `5 · impacto nas entregas`

#### `ds_entrega_cenario_classe` (`a1b2c3d4`)
* **Widgets:** `Entrega Final Atrasada por Classe de Serviço (Atual vs. Prazo honesto)`
```sql
WITH calc AS (
  SELECT
    classe_servico,
    prazo_despacho_prometido,
    CASE
      WHEN fl_extraviado = 0 AND COALESCE(dias_atraso_entrega, 0) > 0 THEN 1
      ELSE 0
    END AS fl_atraso_atual,
    CASE
      WHEN fl_extraviado = 0 AND COALESCE(dias_atraso_entrega, 0) > (
        CASE classe_servico
          WHEN 'Same Day'       THEN 1
          WHEN 'First Class'    THEN 1
          WHEN 'Second Class'   THEN 2
          WHEN 'Standard Class' THEN 0
          ELSE 0
        END
      ) THEN 1
      ELSE 0
    END AS fl_atraso_honesto
  FROM workspace.gold.obt_pedidos_logistica
  WHERE fl_com_desfecho = 1
)
SELECT
  classe_servico,
  ROUND(SUM(fl_atraso_atual), 1) AS sum_entrega_atrasada_atual,
  ROUND(SUM(fl_atraso_honesto), 1) AS sum_entrega_atrasada_nova
FROM calc
GROUP BY classe_servico
ORDER BY MIN(prazo_despacho_prometido);
```

#### `ds_entrega_cenario_geral` (`a1b2c3d3`)
* **Widgets:** `Impacto na ENTREGA FINAL: % Pedidos Entregues com Atraso (Cenário Atual vs. Prazo honesto)`
```sql
WITH calc AS (
  SELECT
    CASE
      WHEN fl_extraviado = 0 AND COALESCE(dias_atraso_entrega, 0) > 0 THEN 1
      ELSE 0
    END AS fl_atraso_atual,
    CASE
      WHEN fl_extraviado = 0 AND COALESCE(dias_atraso_entrega, 0) > (
        CASE classe_servico
          WHEN 'Same Day'       THEN 1
          WHEN 'First Class'    THEN 1
          WHEN 'Second Class'   THEN 2
          WHEN 'Standard Class' THEN 0
          ELSE 0
        END
      ) THEN 1
      ELSE 0
    END AS fl_atraso_honesto
  FROM workspace.gold.obt_pedidos_logistica
  WHERE fl_com_desfecho = 1
)
SELECT
  'Cenário atual' AS cenario,
  ROUND(100.0 * AVG(fl_atraso_atual), 1) AS pct_entrega_atrasada
FROM calc
UNION ALL
SELECT
  'Prazo honesto' AS cenario,
  ROUND(100.0 * AVG(fl_atraso_honesto), 1) AS pct_entrega_atrasada
FROM calc;
```

---

## 3. Datasets SQL Auxiliares (presentes na aba `Data`, sem widget ligado)

#### `prazo_servico` (`b19dae57`)
```sql
SELECT
  classe_servico AS plano_modalidade,
  ROUND(AVG(prazo_despacho_prometido), 1) AS prazo_despacho_atual,
  CEILING(ROUND(AVG(transito_padrao_dias), 1)) AS prazo_transporte_atual
FROM workspace.gold.obt_pedidos_logistica
GROUP BY classe_servico
ORDER BY prazo_despacho_atual;
```

#### `situacao_pedido` (`8325fb01`)
```sql
SELECT
  situacao_pedido,
  COUNT(*) AS qtd_pedidos,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_pedidos
FROM workspace.gold.obt_pedidos_logistica
WHERE fl_com_desfecho = 1
GROUP BY situacao_pedido
ORDER BY qtd_pedidos DESC;
```
