# Cenários de prazo de despacho (TransLog)

**Base:** 36.866 pedidos despachados (Gold OBT). **Regra:** entrega prometida = pedido + prazo de despacho + trânsito padrão.
Aumentar o prazo de despacho aumenta a promessa de entrega na mesma medida. As datas reais não mudam.

| Componente | Origem |
|---|---|
| Prazo de despacho e dias reais até o despacho | Dado real (DataCo) |
| Trânsito padrão, entrega e extravio | Cenário simulado (premissa) |

## 1. Prazos atuais

| Classe | Despacho prometido | Despacho real | Modal | Trânsito doméstico | Trânsito internacional | Entrega prometida |
|---|---|---|---|---|---|---|
| Same Day | 0 | 0–1 | Aéreo expresso | 1 | 2–4 | 1–4 |
| First Class | 1 | sempre 2 | Aéreo expresso | 1 | 2–4 | 2–5 |
| Second Class | 2 | 2–6 | Aéreo consolidado / rodoviário | 2–3 | 4–8 | 4–10 |
| Standard Class | 4 | 2–6 | Aéreo consolidado / rodoviário | 2–3 | 4–8 | 6–12 |

Os prazos estão em dias. Trânsito internacional por mercado, em dias:

| Modal | USCA | LATAM | Europa | Ásia-Pacífico | África |
|---|---|---|---|---|---|
| Aéreo expresso | 2 | 3 | 3 | 4 | 4 |
| Aéreo consolidado | 4 | 5 | 6 | 7 | 8 |

## 2. Prazos dos cenários (despacho em dias)

| Classe | Atual | +1 dia | +2 dias |
|---|---|---|---|
| Same Day | 0 | 1 | 2 |
| First Class | 1 | 2 | 3 |
| Second Class | 2 | 3 | 4 |
| Standard Class | 4 | 5 | 6 |
| Entrega prometida | — | +1 dia | +2 dias |

## 3. Despacho atrasado (dado real)

| Classe | Atual | +1 dia | +2 dias |
|---|---|---|---|
| Same Day | 48,4% | 0% | 0% |
| First Class | 100% | 0% | 0% |
| Second Class | 79,8% | 59,6% | 39,4% |
| Standard Class | 39,7% | 19,9% | 0% |
| **Total** | **57,3%** | **23,5%** | **7,7%** |

## 4. Entrega (cenário simulado, % dos pedidos com desfecho)

| Classe | No prazo: atual → +1 → +2 | Atrasada: atual → +1 → +2 | Extravio (fixo) |
|---|---|---|---|
| Same Day | 61,2 → 80,4 → 80,4 | 19,2 → 0 → 0 | 19,6 |
| First Class | 42,6 → 80,8 → 80,8 | 38,2 → 0 → 0 | 19,2 |
| Second Class | 51,4 → 57,9 → 65,0 | 29,0 → 22,5 → 15,4 | 19,6 |
| Standard Class | 67,1 → 73,3 → 80,2 | 13,1 → 6,8 → 0 | 19,8 |
| **Total** | **59,9 → 71,9 → 77,3** | **20,4 → 8,4 → 3,0** | **19,7** |

| Entregas atrasadas | Atual | +1 dia | +2 dias |
|---|---|---|---|
| Pedidos | 7.471 | 3.088 | 1.092 |

## 5. Leitura

| Ponto | Evidência |
|---|---|
| Same Day e First Class precisam de +1 dia, não mais | Com +1 o atraso zera; +2 não ganha nada |
| Second Class continua atrasando até com +2 dias | Despacha de 2 a 6 dias: só zera com prazo de 6 |
| O teto da entrega no prazo é ~80% | Extravio (19,7%) não depende do prazo |
| O custo é promessa mais longa ao cliente | Cada dia de despacho = +1 dia na entrega prometida |

Fonte: `gold.obt_pedidos_logistica` e `gold.vw_cenarios_prazo` (notebook `03c_gold_obt.sql`). *(Nota: as tabelas acima documentam os testes iniciais +1/+2 dias na versão `v3`.)*

---

## 6. Nova Premissa Aplicada no `dashboard_v2` (Simulação `v4` · 36.671 Finalizados)

No `dashboard_v2` (Abas 4 e 5), foi adotada a premissa recomendada específica por classe de serviço sobre os **36.671 pedidos finalizados (`fl_com_desfecho = 1`)**, mantendo fixos os tempos reais de despacho e trânsito:

| Classe | Ajuste no SLA de Despacho | Despacho Prometido → Realista | Despacho Atrasado (Atual → Novo) | Entrega Final Atrasada (Atual → Nova) |
|---|---|---:|---:|---:|
| `Same Day` | **+1 dia** | 0d → 1d | 48,4% → **0,0%** | 22,2% → **5,6%** |
| `First Class` | **+1 dia** | 1d → 2d | 100,0% → **0,0%** | 27,4% → **0,0%** |
| `Second Class` | **+3 dias** | 2d → 5d | 79,8% → **19,9%** | 22,5% → **5,8%** |
| `Standard Class` | **+1 dia** | 4d → 5d | 39,7% → **19,9%** | 17,5% → **7,9%** |
| **Total (`36.671`)** | — | — | **57,3% → 15,7%** | **20,3% → 6,2%** |

> O resíduo de `6,2%` na entrega final após o ajuste de SLA corresponde principalmente aos gargalos de trânsito (`v4`: Alfândega e Transferência entre hubs), que não se resolvem apenas aumentando o prazo do armazém.
