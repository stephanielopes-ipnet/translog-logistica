# Registro do aceite portal → backend → agente v2

## Estado em 17/11/2026

**Teste conjunto da Silver v2 e FAQ atual: pendente.** Marco esclareceu nesta retomada que já testou o portal com Matheus em uma integração anterior, mas ainda não com a Silver v2. O relato não comprova o aceite da versão atual. Nenhuma resposta nova do portal foi fornecida nesta conversa.

Roteiro de execução: [guia-matheus-fullstack.md](guia-matheus-fullstack.md). Ambiente e chave já preparados devem ser aproveitados. Primeiro teste na máquina de Matheus, com portal e agente usando os mesmos três CSVs exportados. Fonte institucional preservada: Databricks `consumo_*`, sem banco próprio.

## Conferência local desta retomada

- Diagnóstico: `csv_v2`, origem `silver`, `gemini-3.5-flash-lite`, três arquivos presentes, chave configurada (valor não lido/exibido) e índice aprovado presente.
- `GET http://127.0.0.1:8003/list-apps`: HTTP 200, `translog_agent`.
- Backend 3333 e frontend 5173: conexão recusada nesta máquina. Isso não informa o estado da máquina de Matheus.
- Verificação local sem LLM: nove pedidos conferidos, código inexistente reconhecido e quatro buscas reais no Chroma com o trecho esperado entre os três primeiros. Evidência privada: `.state/acceptance-retomada-v2-2026-11-17.json`. Isso não avalia redação Gemini/portal.
- Nenhum processo reiniciado e nenhuma nova chamada generativa executada nesta etapa.

Disponibilidade HTTP/diagnóstico não comprova texto do Gemini nem aceite no portal. Último resultado técnico completo anterior: 51 testes, conforme registro de publicação; não foi repetido por uma alteração somente documental.

## Preencher durante o teste conjunto

Data/hora: a registrar durante a execução. Responsáveis: Marco e Matheus. Máquina, commit do agente, revisão da FAQ, fonte/exportação e modelo: a conferir durante a execução.

| Caso | Evidência necessária | Resultado atual |
| --- | --- | --- |
| Pedido 7 e continuidade | Respostas e ferramenta: despacho +1 / entrega 0 | Não executado nesta retomada |
| Troca para 1001 | Contexto passa ao 1001; quatro linhas e 14 unidades | Não executado nesta retomada |
| Pedido 76380 e FAQ | Entrega +7; consulta e busca; central 9h–18h, segunda a sexta | Não executado nesta retomada |
| Localização do 16 | Sem localização física; Brasília somente destino | Não executado nesta retomada |
| Nova conversa sem pedido aberto | Solicita apenas código; sem herdar outro cliente | Não executado nesta retomada |
| Agente dedicado inacessível | Erro claro no portal, sem inventar resposta | Não executado nesta retomada |

Para cada linha, anexar pergunta, resposta pública, ferramentas/retornos, resultado esperado, observado e ação seguinte. Usar a [ficha de resultados](casos-teste-e-apresentacao-agente.md). Sem dados pessoais, chave, raciocínio interno ou logs privados no GitHub.

Erro 503 deve ser registrado separadamente como indisponibilidade do provedor. Testar agente desligado não demonstra contingência 503. Não declarar aceite completo até registrar os resultados; não agendar ou prometer teste sem combinação entre os participantes.
