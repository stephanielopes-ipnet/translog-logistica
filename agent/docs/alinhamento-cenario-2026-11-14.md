# Alinhamento do cenário internacional — 14/11/2026

## Fontes e estado

Marco trouxe o novo contexto nesta conversa em 14/11. Foram lidas as abas Observações e [Transcrição da reunião de 13/11](https://docs.google.com/document/d/1K1jTUirzqvdt5lEHWSIb1BoTRlCyayIYPA5fqpXYnYI/edit?tab=t.1h4x427octkp). Há erros de reconhecimento e falas sem identificação confiável; não inferir autoria. A confirmação posterior de Marco nesta conversa é a fonte da aprovação do mentor, não uma fala identificada na transcrição.

O cenário internacional é a referência confirmada de trabalho. Após a análise inicial, Marco informou explicitamente em 14/11 que o mentor Othon já aprovou tanto o novo cenário quanto a possibilidade de complementar a base com dados simulados. Essa confirmação substitui a pendência anterior de aprovação. Não implica que banco, API, dicionário ou todos os critérios técnicos tenham sido definidos. Não exige criar complemento agora; nenhum dado simulado adicional foi criado nesta análise.

## Descrição proposta

> A TransLog é uma operadora logística internacional fictícia, representada neste projeto por dados históricos de pedidos do DataCo. Sua gestão precisa de visibilidade sobre prazos, atrasos e diferenças de desempenho entre mercados, destinos e classes de serviço. Seus clientes precisam de um canal simples para consultar a situação dos pedidos e obter orientações de atendimento. O projeto combina tratamento de dados, indicadores, portal e agente de IA. Eventos complementares criados para a demonstração serão identificados como simulados.

As dores de gestão e atendimento são premissas do cenário informado por Marco, não medições do dataset. Os 300 caminhões, 15 estados e 18% de atraso pertencem ao cenário anterior e não serão métricas do cenário internacional.

Marco esclareceu posteriormente em 14/11 que Matheus de Dados informou ao grupo a sede em Porto Rico, adotada como contexto do cenário. A fonte dessa informação é Matheus de Dados, segundo Marco; não é uma dedução do CSV. O significado de origem de despacho continua a conciliar com o dicionário: `origem_cliente_pais` não comprova por si só instalações logísticas.

## Evidências da reunião

| Trecho | Registro | Consequência |
| --- | --- | --- |
| 00:00:06–00:00:31 | Tratamento de atrasos atribuídos a pedidos sem pagamento processado | Confirmar elegibilidade do atraso com Dados |
| 00:01:49–00:02:35 | Discussão de retirar coordenadas inconsistentes | Não apresentar coordenadas como localização de veículo; conferir exportação |
| 00:03:26–00:04:16 | Resumos diários para documentação consolidada | Registrar feito/próximo/bloqueio/evidência; não autoriza envio de mensagens pelo assistente |
| 00:05:31–00:06:11 | Nuvem como possibilidade posterior; primeiro MVP local | Manter prioridade local, sem provisionar por inferência |
| 00:07:29–00:07:48 | Silver pelo Drive devido ao tamanho | Distribuição da base separada do código |
| 00:08:52–00:10:22 | Ausência de eventos de rastreio e discussão de rotas internacionais | Timeline depende de complemento identificado; nenhuma API de rotas foi comprovada ou escolhida |
| 00:10:40–00:13:38 | Divergência com cenário de caminhões e necessidade de esclarecer dores/escopo | Revisar cenário e critérios com grupo/mentor |

O trecho final registra dúvida e intenção de buscar esclarecimento; não traz resposta definitiva do mentor.

## Conferência da Silver local

Fonte recebida em 13/11, SHA-256 `133B31DDCCCF7358B00870FAA1E89B99A9FDBA88E6AE83A85BDD0F5FD55D409C`. Leitura completa das 180.519 linhas em 14/11. Contagens são de **itens**, não de pedidos.

| Campo | Valores observados |
| --- | --- |
| `mercado_logistico` | LATAM (51.594), Europe (50.252), Pacific Asia (41.260), USCA (25.799), Africa (11.614) |
| `modo_envio` | Standard Class (107.752), Second Class (35.216), First Class (27.814), Same Day (9.737) |
| `origem_cliente_pais` | Estados Unidos (111.146), Porto Rico (69.373) |
| `destino_pais` | 164 valores distintos na versão inspecionada |

- Cinco mercados e quatro classes estão presentes. Classe de serviço não prova uso de caminhão/avião/navio nem estabelece automaticamente um SLA.
- Destinos permitem analisar concentração de atrasos por geografia. Não localizam onde ocorreu o atraso dentro do trajeto nem explicam causa.
- O arquivo recebido ainda contém `latitude_origem`/`longitude_origem`, enquanto a reunião posterior discute retirar coordenadas. Conferir se há versão nova antes de integrar.
- Existem 79.510 itens sem atraso avaliado ou cancelados, com dias numéricos preenchidos. A consulta atual recalcula diferença não negativa nesses casos; adaptar somente nomes de colunas não basta. Ver [inspeção de 13/11](roteiro-marco-13-11.md).

## Impacto nas entregas

| Frente | Ajuste recomendado, a conciliar com responsável |
| --- | --- |
| Gestão | Unificar cenário, fontes e critérios e refletir a aprovação do reenquadramento informada por Marco |
| Dados | Fornecer dicionário, derivação dos status, elegibilidade do atraso, grão e versão |
| BI | Medir desempenho por mercado/destino/classe com denominador e exclusões claros; separar hipótese de causa comprovada |
| IA | Consulta exata e orientações recuperadas, explicitando fonte histórica/simulada; reconhecer causa/ETA/GPS indisponíveis |
| FullStack | Consulta e chat; timeline com origem dos eventos; mapa ilustrativo identificado |

Indicadores candidatos, não novos requisitos confirmados: pedidos avaliados/não avaliados; taxa de atraso entre pedidos elegíveis; diferenças por classe, mercado e destino; cancelamentos. Validar com Dados/BI o denominador e como tratar itens divergentes.

## Uso de simulações

Criar apenas complemento necessário a um cenário de demonstração acordado: por exemplo, poucos eventos de timeline ou textos de atendimento fictícios revisados.

1. Preservar a Silver original e manter complemento separado.
2. Identificar simulação, fonte, versão e regra de geração; manter vínculo com pedido/item quando necessário.
3. Não atribuir motivo inventado ao atraso histórico. Um cenário inteiramente sintético de causa deve ser identificado como tal.
4. Não incluir eventos/causas artificiais nos indicadores históricos sem análise separada e rotulada.
5. Política fictícia aprovada para demo continua sendo política de demonstração, nunca regra real de transportadora.
6. Definir data de referência da demonstração; não comparar datas históricas com hoje para inventar atraso atual.

Metadados sugeridos como `is_simulated`, `source` e `version` ainda precisam ser conciliados com os contratos. A origem atual da fonte não significa que uma timeline mista já esteja implementada.

## Próximos passos de Marco

ADK, duas ferramentas, Chroma, execução local, testes e API continuam aplicáveis. Não é necessário reconstruir a base. Revisar contexto do agente e exemplos após consolidar o cenário, adaptar a semântica da Silver e executar SQL somente após escolha do banco.

Perguntas de avaliação adicionais estão registradas em `avaliacao.md`. Nenhum prazo novo, banco ou formato de chat foi confirmado por esta análise; as pendências de DuckDB/Gold/`/chat` permanecem abertas.

Confirmar: última exportação e dicionário; complemento de eventos necessário e responsável. A aprovação do mentor para cenário internacional e simulações já foi confirmada por Marco. Enquanto os detalhes técnicos são alinhados, continuar a conversa ADK com amostra identificada e preparar a contribuição no repositório único. Evitar trabalho com API de rota antes de fechar a necessidade do mapa.

## Revisão completa posterior da exportação

A pedido de Marco e de Matheus de Dados, a auditoria de 14/11 percorreu todas as linhas e colunas, sem alterar a fonte. Ver [relatório completo](revisao-silver-2026-11-14.md) e [mensagem preparada para Dados](mensagem-dados-revisao-silver-2026-11-14.md). A sede informada por Dados não é tratada como defeito por não aparecer numa coluna; a revisão distingue problemas de texto, triagem de coordenadas, regras observadas e definições a confirmar.
