# Riscos

Exposição = probabilidade x impacto (escala de 1 a 3). Situação atualizada em 22/11.

Legenda: **Mitigado** (resposta funcionou) · **Ocorreu** (o risco se materializou e foi tratado) · **Aberto** (ainda exige ação).

## Matriz

| # | Risco | P | I | Exposição | Resposta planejada | Dono | Situação em 22/11 |
|---|---|---|---|---|---|---|---|
| 1 | Integração entre Databricks, assistente e portal falhar | 3 | 3 | 9 | Contratos de dados e Gold exportada até 16/11 | Mateus | **Mitigado.** Contrato `consumo_*` fechado em 16/11; portal e LogBot integrados em Docker (PRs #31 e #35) |
| 2 | Limites do Databricks (cluster expira, sem acesso externo) | 2 | 3 | 6 | Notebooks no Git, export local e prints | Mateus | **Ocorreu em parte.** PMO sem leitura na Gold até 21/11 (resolvido com permissão por schema). Notebooks no Git em 22/11 (PR #37) |
| 3 | Demo falhar na banca | 2 | 3 | 6 | Vídeo de backup e teste em duas máquinas | Stephanie | **Mitigado.** Portal publicado em servidor como plano B; assistente reserva (`AGENT=mock`) se a IA cair |
| 4 | Banca questionar o uso do DataCo | 3 | 2 | 6 | Premissas claras no escopo e na apresentação | Stephanie | **Mitigado.** Cada coluna da Gold é rotulada como real ou simulada; premissas na tela 6 do painel |
| 5 | Assistente inventar status | 2 | 3 | 6 | Status só via consulta estruturada e 10 perguntas de teste | Marco | **Mitigado.** Status vem dos dados; FAQ fechada com 18 trechos; 49 testes no agente |
| 6 | Chave de API publicada no repositório | 2 | 3 | 6 | `.env` no `.gitignore` e revisão de PR | Marco e Matheus | **Mitigado.** Apenas `.env.example` versionado |
| 7 | Apresentação passar do tempo | 2 | 3 | 6 | Dois ensaios cronometrados | Stephanie | **Aberto até a banca.** Formato confirmado em 20 + 5 min; roteiro com tempo por parada e folga de 1:15 |
| 8 | Escopo crescer depois de 19/11 | 2 | 2 | 4 | Code freeze | Stephanie | **Mitigado.** Depois de 19/11, só correções, painel e documentação |
| 9 | Integrante indisponível | 2 | 2 | 4 | README de execução em cada pasta | Stephanie | **Mitigado.** Não ocorreu |
| 10 | Commits concentrados em poucas pessoas | 2 | 2 | 4 | Auditoria diária do repositório | Stephanie | **Ocorreu em parte.** Pipeline e consultas do dashboard subiram em 22/11 (PR #37). Export do dashboard pelo Marcelo pendente |

## Riscos que surgiram durante o projeto

| # | Risco | P | I | Exposição | Resposta | Dono | Situação em 22/11 |
|---|---|---|---|---|---|---|---|
| 11 | Mudança do cenário do cliente no meio do projeto | 3 | 3 | 9 | Realinhar com o mentor, comunicar ao time e replanejar sem mover a data final | Stephanie | **Ocorreu.** Aprovado em 14/11; absorvido em 1 dia |
| 12 | Indicador de atraso inflado por pedidos não pagos | 3 | 3 | 9 | Atraso só para pedidos pagos e despachados | Mateus | **Ocorreu.** Corrigido na Silver (98.976 → 57.810 itens) |
| 13 | Base sem dados depois do despacho | 3 | 2 | 6 | Trajeto simulado, determinístico e identificado | Mateus | **Mitigado.** Rótulo real/simulado por coluna na Gold |
| 14 | Números diferentes entre painel, portal e apresentação | 2 | 3 | 6 | Fonte única: `gold.obt_pedidos_logistica` | Stephanie | **Mitigado.** Painel refeito com a OBT; entrega no prazo alinhada em 60,0% (não 74,8%) |
| 15 | Achado de cenário simulado apresentado como fato | 2 | 3 | 6 | Marcar simulação em cada tela e na fala | Marcelo e Matheus | **Aberto até a banca.** Pico de abr–ago/2016 e extravio de 19,7% vêm da simulação |
| 16 | Cota ou instabilidade do modelo Gemini | 2 | 2 | 4 | Troca de versão e assistente reserva | Marco e Matheus | **Ocorreu.** Erros 503 em 14/11, tratados |
