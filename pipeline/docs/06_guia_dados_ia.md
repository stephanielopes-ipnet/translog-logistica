# Guia de dados para o time de IA (Silver TransLog)

**Catálogo:** `workspace` · **Schema:** `silver` · **Data de referência da base:** 06/02/2018
A base é uma **foto histórica tirada em 06/02/2018**. Para o agente, "hoje" é essa data. Ex.: "seu pedido está em trânsito" quer dizer "em trânsito em 06/02/2018".

---

## 1. Qual tabela usar
| Tabela | Grão | Para quê | A IA precisa? |
|---|---|---|---|
| **`silver.consumo_pedidos`** | 1 linha por pedido | Tudo sobre o pedido: situação, prazos, atraso, local atual, itens, linha do tempo e um texto pronto | **Sim, é a principal** |
| `silver.consumo_eventos_logisticos` | 1 linha por evento | Linha do tempo detalhada (cada etapa com data e local) | Só se quiser detalhar o histórico além da coluna `linha_do_tempo` |
| `silver.consumo_itens_pedido` | 1 linha por item | Produto, quantidade e valores de cada item | Só se precisar do valor por item (a lista já está em `lista_itens`) |

**Na maioria dos casos, a IA lê só a `consumo_pedidos`, sem join.**

As três são **tabelas Delta** (não views), recriadas a cada execução do pipeline. A `consumo_pedidos` tem Change Data Feed ligado, então pode ser usada direto como origem de um índice do **Vector Search**.

## 2. Colunas mais importantes da `consumo_pedidos`
| Coluna | O que é | Exemplo |
|---|---|---|
| `id_pedido` | Número do pedido (chave) | 76543 |
| `id_cliente` | Cliente dono do pedido. **Use sempre como filtro**: o cliente só pode ver os próprios pedidos | 9826 |
| `resumo_pedido` | **Texto pronto** com itens, situação, local, prazo, atraso e motivo. É o melhor campo para o agente responder ou para indexar em busca semântica | "Pedido nº 76543, feito em 22/01/2018. Itens: 1x … Situação: em trânsito. Local atual: … Prazo de entrega: 31/01/2018. Pedido atrasado em 6 dia(s). …" |
| `linha_do_tempo` | Histórico em uma linha, do pedido ao último evento | "22/01/2018 Pedido registrado · 26/01/2018 Pedido despachado · …" |
| `situacao_pedido` | Situação atual (valores na tabela abaixo) | Em trânsito |
| `lista_itens`, `qtd_itens`, `valor_total_pedido` | O que foi comprado | "1x Asa delta, 2x Chinelo" |
| `local_atual`, `etapa_atual_desc` | Onde o pedido está (ou onde parou) | "Alfândega Xangai (China)", "3 - Alfândega" |
| `data_entrega_prevista` | Prazo de entrega prometido | 31/01/2018 |
| `data_entrega_realizada` | Quando foi entregue (vazio se não entregue) | 30/01/2018 |
| `flag_atraso_entrega`, `dias_atraso_entrega` | Entrega atrasada? Quantos dias (em trânsito: atraso acumulado até 06/02/2018) | 1, 6 |
| `data_despacho_prevista`, `data_despacho_real` | Quando deveria sair e quando saiu do centro de expedição | 24/01 → 26/01 |
| `flag_atraso_despacho`, `dias_atraso_despacho`, `causa_atraso_despacho` | Atraso na expedição e causa (`Promessa irreal` = prazo da modalidade curto demais; `Atraso operacional`) | 1, 2, Atraso operacional |
| `motivo_ocorrencia` | Explicação em uma frase: despacho + transporte | "Despacho em 4 dia(s), 2 dia(s) além do prazo…" |
| `modo_envio`, `destino_pais`, `destino_cidade` | Serviço e destino (pt-BR). A modalidade define o prazo de **despacho**, não o de entrega: o prazo de entrega está sempre em `data_entrega_prevista` | Rápido (despacho em 2 dias), China, Xangai |

### Valores de `modo_envio`
| Valor | Original DataCo | Prazo de despacho |
|---|---|---|
| `Expresso (despacho no mesmo dia)` | Same Day | 0 dia |
| `Prioritário (despacho em 1 dia)` | First Class | 1 dia |
| `Rápido (despacho em 2 dias)` | Second Class | 2 dias |
| `Padrão (despacho em 4 dias)` | Standard Class | 4 dias |

O agente nunca deve prometer entrega no mesmo dia ou em 1 dia com base na modalidade.

### Valores de `situacao_pedido`
| Valor | Significado para o cliente |
|---|---|
| `Entregue no prazo` | Chegou até a data prometida |
| `Entregue com atraso` | Chegou depois da data prometida (`dias_atraso_entrega`) |
| `Em trânsito` | A caminho; ver `local_atual` e `data_entrega_prevista` |
| `Extraviado` | O volume se perdeu; `local_atual` mostra onde foi visto pela última vez |
| `Aguardando pagamento` | Pedido recente, pagamento ainda não confirmado; não foi despachado |
| `Não pago (expirado)` | O pagamento nunca foi confirmado; o pedido expirou sem despacho |
| `Cancelado` | Pedido cancelado |

Colunas de datas, atraso e local ficam **vazias** quando não se aplicam (ex.: pedido cancelado não tem data de despacho). O agente não deve inventar valor.

## 3. Consultas prontas
```sql
-- Pergunta com número do pedido ("onde está meu pedido 76543?")
SELECT resumo_pedido, linha_do_tempo
FROM silver.consumo_pedidos
WHERE id_pedido = 76543 AND id_cliente = :id_cliente;   -- sempre filtrar pelo cliente logado (parâmetro)

-- Todos os pedidos do cliente ("meus pedidos")
SELECT id_pedido, data_pedido, situacao_pedido, lista_itens, data_entrega_prevista
FROM silver.consumo_pedidos
WHERE id_cliente = :id_cliente
ORDER BY data_pedido DESC;

-- (Opcional) linha do tempo detalhada: join por id_pedido
SELECT e.sequencia, e.ts_evento, e.descricao_evento, e.local_evento
FROM silver.consumo_eventos_logisticos e
WHERE e.id_pedido = 76543 AND e.id_cliente = :id_cliente
ORDER BY e.sequencia;

-- (Opcional) itens com valor: join por id_pedido
SELECT i.nome_produto, i.quantidade_item, i.valor_item_pedido
FROM silver.consumo_itens_pedido i
WHERE i.id_pedido = 76543 AND i.id_cliente = :id_cliente;
```

## 4. Sugestões para o agente
- **Pergunta com número de pedido:** busca exata pela `consumo_pedidos` (por exemplo, uma função ou tool `rastrear_pedido(id_pedido, id_cliente)`). A resposta sai do `resumo_pedido`.
- **Pergunta sem número** ("meu caiaque não chegou"): busca semântica sobre o `resumo_pedido`, **filtrando por `id_cliente`** antes da similaridade.
- **Perguntas de gestão** ("quantos pedidos atrasaram?"): não são do agente de atendimento; use as tabelas `gold.*`.
- Não pergunte nem exponha nome, e-mail ou endereço: eles não estão nessas tabelas.

## 5. Volumes e Diferença para o Dashboard (BI)
| Tabela | Linhas | Escopo |
|---|---:|---|
| `silver.consumo_pedidos` | **65.752** | Todos os pedidos (inclui `28.886` não pagos/cancelados/aguardando para atendimento no chat) |
| `silver.consumo_itens_pedido` | **180.519** | Todos os itens dos `65.752` pedidos |
| `silver.consumo_eventos_logisticos` | **350.421** | Todos os eventos da fatia publicada (`v4`) |

> **Atenção ao comparar Portal (`silver.consumo_*`) vs. Dashboard (`gold.obt_*`):**
> - O **Portal e o Agente de IA** leem `silver.consumo_pedidos` (**65.752** pedidos) para responder ao cliente inclusive sobre pedidos `Cancelado` (`2.855`), `Não pago (expirado)` (`26.008`) ou `Aguardando pagamento` (`23`).
> - O **Dashboard executivo (`dashboard_v2`)** lê `gold.obt_pedidos_logistica` com `WHERE fl_com_desfecho = 1` (**36.671** pedidos finalizados dentre os `36.866` despachados, excluindo os `195` ainda `Em trânsito` em `06/02/2018`).
> - **Para painéis gerenciais no Portal (Torre de Controle):** nunca agregue `silver.consumo_pedidos` sem `WHERE`. Para bater exatamente com o Dashboard, consulte `gold.obt_pedidos_logistica WHERE fl_com_desfecho = 1` (ou filtre `situacao_pedido IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado')`).

Dúvidas sobre os dados: Engenharia de Dados (Mateus). Detalhes técnicos: `05_arquitetura_dados_silver.md` e `07_guia_gold_obt_analista.md`.
