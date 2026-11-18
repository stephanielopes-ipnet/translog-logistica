# TransLog Brasil — plano de implementação e colaboração

Atualização posterior de 17/11: Marco confirmou FAQ fechada, já conciliada e indexada em 18 trechos. A fonte do projeto foi alinhada em 16/11: tabelas `consumo_*` no Databricks, com CSVs como alternativa local e sem banco próprio, conforme `portal/docs/backend.md`. As notas de banco/FAQ pendentes abaixo pertencem ao planejamento anterior. O agente de teste usa a exportação CSV v2; conexão SQL direta do agente é uma implementação separada, não uma nova decisão a pedir ao grupo. Interface de teste atual: http://127.0.0.1:8003 ; roteiro em `roteiro-testes-silver-v2-faq.md`.

Versão de trabalho atualizada em 14/11/2026. Documento revisável conforme aprendizado. Requisitos: [briefing](https://docs.google.com/document/d/1Q1steYXw1lVysO0sfpmwrVNIChxj1vO6D70Ja72bSJ8/edit). Acordos: [daily](https://docs.google.com/document/d/1pLD--SbRM6r8bZcbSlqcJqf_n77xVVThexhrwjW1YZI/edit?tab=t.okgggspbm3x0), reunião de 13/11 e atualizações explícitas de Marco.

## Objetivo

Agente ADK que consulta pedidos e recupera FAQ e políticas pelo Chroma, consumido pelo portal. MVP local/Databricks, arquitetura GCP conceitual. Silver recebida em **13/11**, com semântica/versão a validar. O banco definitivo aguarda o grupo; PostgreSQL é sugestão, SQLite não é requisito.

O cenário confirmado em 14/11 é internacional: visibilidade gerencial de desempenho e canal simples de atendimento. Marco informou nesta conversa que o mentor Othon já aprovou o novo cenário e a possibilidade de complemento simulado. Cinco mercados e quatro classes de serviço estão na Silver; sede, despacho e causas não devem ser inferidos de nomes de colunas. Os números de frota/18% do cenário anterior deixam de fundamentar a entrega. Ver [alinhamento e impactos](alinhamento-cenario-2026-11-14.md).

Marco autorizou complemento simulado se necessário, identificado e separado dos dados/indicadores históricos. Primeiro definir o mínimo de eventos necessário à demo; mapa e API de rota internacional não são pré-requisitos para desenvolver consulta e chat. O cronograma abaixo continua como planejamento anterior, sem prazos novos confirmados por esta revisão.

## Entregas e dependências

1. Ambiente Python, agente básico, configuração local e amostra identificada.
2. Contrato da Silver e consulta independente do ADK, preservando itens e nulos.
3. Conector SQL somente após o grupo definir banco, carga, acesso de leitura e atualização.
4. Índice local Chroma para FAQ e políticas revisadas; exemplos de teste separados.
5. Um agente com duas ferramentas e instruções de resposta baseadas em evidência.
6. API nativa do ADK e contrato com o backend de Matheus.
7. Testes, avaliação de dez conversas, reprodução e apresentação.

Marco não precisa implementar o pipeline, dashboard ou portal. Stephanie organiza quadro/repositório/cronograma e coordena revisão do conteúdo; Dados fornece Silver e dicionário; Matheus integra portal e API; Marcelo confere conceitos/indicadores. Identificar as pessoas pelo papel quando a transcrição confundir nomes.

## Cronograma

| Data | Marco | Dependência e evidência |
| --- | --- | --- |
| 13/11 | Ambiente; receber Silver; conferir campos | Acesso ao repo/modelo; contrato de dados e chat; agente simples |
| 14/11 | Consulta, amostra e testes sem LLM | Códigos com resultados esperados conferidos com Dados |
| 15/11 | ADK chama consulta; API; recuperação de conhecimento | Primeira chamada com Matheus; FAQ/políticas com Stephanie |
| 16/11 | Dados tratados; conector se banco escolhido; avaliação | Comunicar pendências e impacto no prazo |
| 17/11 manhã | Agente, endpoint, instruções e resultados | Matheus consegue executar/consumir; pendências explícitas |
| 18/11 | Integração na máquina da demo | Portal/backend/agente; versões de dados compatíveis |
| 19/11 | Correções, evidências, vídeo e congelamento | Demonstração ponta a ponta |
| 21–22/11 | Ensaios | Até duas horas por dia, horário combinado |
| 23/11 | Banca | Todos explicam sua entrega |

20/11 não tem trabalho obrigatório neste plano. Bloco diário: 15 min de alinhamento, 15 de aprendizado, 75 de desenvolvimento e 15 de conferência. Uma daily de 30 min reduz desenvolvimento em 15 min. Bloqueio de 30 min deve ser registrado e comunicado, sem ficar parado se há trabalho independente.

## Primeiro bloco de Marco

1. Pedir à Stephanie a URL do repositório e os acessos.
2. Confirmar chave e modelo disponíveis, sem publicar o segredo.
3. Pedir a quem trata os dados uma amostra da Silver e o significado dos campos.
4. Seguir `guia-marco.md` para ambiente, consulta, Chroma e ADK.
5. Registrar feito, próximo passo e bloqueio no quadro.

Mensagem para Dados: “Receberei a Silver em 13/11. Podemos conferir os campos de pedido/item, status e dias previstos/reais? Preciso de exemplos atrasado, no prazo, vários itens e informação ausente. Você trata/exporta; eu adapto a consulta da IA.”

Mensagem para Matheus: “Minha API será a nativa do ADK, documentada em `api-chat.md`. Vamos testar cedo com amostra e depois usar os dados tratados. A demo executará portal, backend e agente juntos.”

Mensagem para Stephanie: “A IA terá consulta e recuperação de FAQ/políticas. Preciso dos textos revisados e da decisão do banco com o grupo; exemplos de teste não serão publicados como políticas reais.”

## Critérios de conclusão

SQL real no banco decidido, Silver validada, conhecimento revisado, agente pela API, portal integrado, dez conversas registradas e execução reproduzível. O estado técnico atual fica em `status-implementacao.md`. Testes sem modelo e conteúdo sintético não comprovam a avaliação com LLM ou as políticas finais.

O grupo completa pipeline reexecutável, cinco ou mais KPIs Gold, arquitetura conceitual/segurança/custos com premissas, monitoramento/SLA, documentação, retrospectiva e apresentação. Associações observadas não são causas comprovadas e métricas do dataset são separadas dos números fictícios do cenário.

## Mudanças

Seguir `decisoes.md`: registrar motivo, fonte, impacto, envolvidos e verificações. Banco, campos, bibliotecas e cronograma podem evoluir. A interface pública só muda com atualização do contrato e comunicação à pessoa que a consome.
