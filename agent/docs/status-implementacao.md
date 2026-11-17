# Estado verificável da implementação

Atualização documental: 17/11/2026. Os registros datados abaixo preservam o histórico de cada etapa.

## Duas conversas Gemini autorizadas e executadas — 17/11

Marco autorizou explicitamente a transmissão dos dados mínimos dos pedidos 1001 e 12 ao Gemini/Google para as duas conversas preparadas. Ambas responderam sem erro 503 nesta execução. A primeira consultou o pedido 1001 e informou corretamente entrega histórica/simulada em San Lorenzo em 22/01/2015. A segunda chamou consulta e busca de conhecimento, separou despacho de entrega e reconheceu os limites para alterar endereço. **Resultado parcial da segunda:** faltou citar título/fonte/versão do trecho. Instrução reforçada depois da observação; efeito desse reforço ainda não reavaliado com Gemini. Ver [respostas e limites](avaliacao-gemini-v2-2026-11-17.md). Não repetir pedido de autorização para essas duas chamadas já executadas nem tratá-las como avaliação integral aprovada.

## Integração Silver v2 recebida e FAQ — atualização posterior de 17/11

- Recebidos e auditados integralmente os três CSVs do ZIP de Mateus: **65.752 pedidos, 180.519 itens e 350.416 eventos**. Checagens de estrutura/chaves/relações/unidades/último evento/cronologia sem ocorrências na versão entregue. Histórico com complemento simulado, referência 06/02/2018; dicionário versionado de geração ainda não fornecido. Originais preservados e ignorados no Git.
- Implementado e ativado localmente `csv_v2`: separa despacho e entrega, preserva nulos e negativos em ambos, mantém todos os itens e eventos, retorna só campos necessários e reconhece indisponibilidade. Marco confirmou que 4/2/1 dias são despacho. O pedido 1001 agora é o da v2 (quatro itens, entregue no prazo no cenário), não o da amostra anterior.
- FAQ v1 recebida de Stephanie como rascunho; original preservado. Oito orientações técnicas revisadas localmente indexadas no Chroma real, revisão `14b9e4e37aa7cf114f87`; não são aprovação comercial final de Stephanie. Regras de horário/encaminhamento/limiar pendentes ficaram fora. Quatro buscas recuperaram o trecho esperado em top3.
- Suíte atual: **49 passaram, 10 avisos de depreciação, em 7,23 s**, inclusive API ADK real com ferramenta v2 e modelo determinístico. Dois achados da revisão independente foram reproduzidos e corrigidos: entrega negativa e auditoria de marcadores/cronologia. Evidência `.state/test-results-silver-v2.xml`.
- Avaliação com Gemini não executada: revisão automática rejeitou a transmissão de dados mínimos de pedidos/itens/locais e orientações ao Google. Script de duas conversas preparado, aguardando autorização explícita. Não há resultado Gemini/portal aprovado nesta versão nem contingência 503 implementada.
- Relatório, casos e reprodução em [integracao-silver-v2-2026-11-17.md](integracao-silver-v2-2026-11-17.md). Servidores existentes, chave e modelo preservados. SQL/banco, políticas finais, integração ao portal e publicação no GitHub continuam pendentes.

## Gold anunciada e comunicação amigável — 17/11

- Marco informou que Mateus de Dados enviará a Gold. [Lista priorizada e mensagem para Dados](solicitacao-gold-mateus-2026-11-17.md) preparadas, sem envio externo. Incluem detalhe por pedido/item, definições de status/datas/atraso, eventos simulados identificados e dicionário com casos conferíveis. Não houve recebimento de nova base, schema aprovado, decisão de banco ou troca da fonte ativa.
- Comunicação amigável configurada localmente em `src/translog/agent_factory.py`: português simples, acolhimento profissional, respostas curtas, empatia breve e uma pergunta por vez. Preservadas ferramentas e restrições de evidência; refinada a distinção entre pedido de amostra e política demo e a descrição de conhecimento revisado ausente.
- Verificação executada nesta etapa: `.venv/Scripts/python.exe -m pytest -q --junitxml=.state/test-results-2026-11-17.xml`: **30 passaram, 9 avisos de depreciação, em 6,41 s**. Primeira execução restrita interrompida sem saída; suíte concluída em execução autorizada fora do sandbox. Testes usam modelo determinístico e não fazem inferência Gemini.
- [Avaliação do tom com Gemini](comunicacao-agente.md) ainda pendente; suíte técnica não comprova estilo de conversa. O ADK já aberto precisa ser reiniciado na pasta alterada e uma nova conversa iniciada para carregar a instrução. Nenhum servidor do usuário foi reiniciado, nenhuma chave lida/exposta e nenhuma publicação ou cópia para o repositório do grupo foi feita nesta etapa.

## Teste de API com o agente configurado — 15/11

Marco apresentou inicialização do servidor nativo na porta 8002 e retorno bem-sucedido do cliente `chat_demo.py` para 1001, com resposta coerente com a amostra fictícia/histórica (4/6 dias, 2 de atraso). Esta execução manual é separada dos testes com modelo determinístico e foi realizada por Marco, não pelo assistente. Evidência e reprodução em [teste-api-local-2026-11-15.md](teste-api-local-2026-11-15.md). A execução na máquina de Matheus FullStack e a comunicação do portal ainda estão pendentes. Fonte ativa não mudou para Silver e nenhuma recuperação Chroma foi demonstrada por esse teste.

## Resumo após integração e explicação para apresentação — 14/11

- Teste 1005: resposta inicial acrescentou “dias úteis” sem fonte; evento da ferramenta confirmou apenas 4 dias programados e dias registrados/atraso ausentes. Após reforço da instrução e orientação de reinício/nova sessão, Marco apresentou resposta sem a classificação inventada ou data de chegada. Ajuste e evidências em `agent/docs/avaliacao-1005.md`, publicados no PR #30, commit `1bda182`. Suíte na pasta integrada: 30 passaram, 9 avisos em 10,50 s, com ambiente original reutilizado. Resultado manual limitado à resposta apresentada, sem novo evento observado; não conclui avaliação geral ou Silver.

- Retorno mais recente de Dados: Mateus (sem H) esclareceu o motivo geral dos atrasos vazios e anunciou atualização da base em 14/11, com novas colunas. Arquivo atualizado ainda não recebido; dicionário completo, mapeamentos de status, banco e fonte final não confirmados nessas mensagens. Chamada oferecida após o envio, ainda sem agendamento. Ver [alinhamento-dados-2026-11-14.md](alinhamento-dados-2026-11-14.md). Nenhum código ou fonte ativa alterado por esse retorno.

- Atualização posterior: documentação da API concluída e publicada no mesmo PR #30, commit `122cea8`. Incluídos `agent/docs/api-chat.md`, `agent/docs/guia-matheus-fullstack.md` e links no README. Guias refletem a opção de Marco por compartilhar privadamente a chave já criada com Matheus FullStack; nenhum segredo foi incluído.
- Nesta etapa, 11 testes existentes de API e CLI/cliente passaram, com 3 avisos. OpenAPI e opções do CLI foram conferidos. Conteúdo publicado verificado pelo conector; PR permanece rascunho sem merge. Instalação na máquina do FullStack, inferência pela API com Gemini e ligação ao portal continuam pendentes.

- Base copiada para `agent/` no repositório único; commit `7e54bf1` publicado por Marco no [PR #30](https://github.com/stephanielopes-ipnet/translog-logistica/pull/30), verificado como rascunho neste acompanhamento. Não houve merge registrado.
- Marco apresentou `30 passed, 9 warnings in 4.80s` no destino, após criar `.cache`. Ambiente Python original reutilizado; instalação independente no destino ainda não verificada.
- Evento de retorno de `consultar_pedido` conferido para 1001; respostas de 1004, 9999 e pergunta sem código apresentadas e conferidas nos limites registrados em `avaliacao.md`. Não são dez conversas aprovadas.
- Os testes automatizados e as conversas usaram amostra/arquivos artificiais, não a Silver de Matheus de Dados. A auditoria da Silver é uma verificação separada.
- Chroma implementado e testado tecnicamente; as consultas manuais de status não demonstraram RAG. Conteúdo revisado e avaliação conversacional de recuperação continuam pendentes. SQL não implementado, banco pendente.
- Explicação e avaliação da entrega documentadas em [explicacao-agente-apresentacao.md](explicacao-agente-apresentacao.md). [Mensagem ao grupo](mensagem-grupo-avanco-ia-2026-11-14.md) apenas redigida, não enviada.
- Esta revisão alterou somente documentação, sem ler a chave, mudar a fonte ativa, executar inferência ou repetir a suíte. Próximo: documentação da API e alinhamento com Matheus FullStack; em Dados, confirmar versão/dicionário/semântica da Silver.

As seções seguintes preservam o contexto histórico de cada etapa. Declarações como “ainda conferir evento”, “Silver ainda não recebida” e “integração pendente” devem ser lidas com suas respectivas datas e o resumo atual acima.

## Primeiro retorno com Gemini relatado por Marco — 14/11

- Marco configurou chave pessoal na `.env` após bloqueio de acesso na conta corporativa. Nenhum segredo foi solicitado ou registrado no chat/documentação.
- `gemini-3.8-flash` retornou 503/alta demanda em tentativas do ADK Web. Após alterar para `gemini-3.5-flash-lite` e reiniciar, Marco colou resposta ao pedido 1001 coerente com a amostra (4 previstos, 6 reais, 2 de atraso), identificada como fictícia/histórica.
- Fonte do resultado: relato e resposta apresentados por Marco. Diagnóstico local posterior confirmou chave preenchida, modelo `gemini-3.5-flash-lite`, amostra ativa e índice aprovado ausente; nenhuma nova chamada ao Gemini foi feita pelo assistente.
- Ainda conferir evento de chamada da ferramenta e demais cenários. A expressão “amostra/política demo” na resposta deve ser refinada para não atribuir política a uma consulta de pedido. As dez conversas continuam pendentes de avaliação completa.
- Ponto de continuidade para novo chat: [retomada-marco.md](retomada-marco.md).

## Auditoria completa da Silver em 14/11

- Todas as 180.519 linhas e 41 colunas auditadas, com verificações de estrutura, agrupamento, datas/status, finanças, geografia e texto derivado. Resultado em [revisao-silver-2026-11-14.md](revisao-silver-2026-11-14.md); mensagem preparada em [mensagem-dados-revisao-silver-2026-11-14.md](mensagem-dados-revisao-silver-2026-11-14.md).
- Estrutura e aritmética majoritariamente consistentes. Seis grafias de cidades com `?` em 130 itens (38 pedidos), incluindo sete com caractere de controle U+0092. Triagem geográfica sinalizou 825 itens para revisão, sem geocodificação.
- Documentar/revisar elegibilidade do atraso, status derivados, precisão temporal de Same Day, arredondamento monetário, taxonomia e texto histórico. Manter os 79.510 nulos de atraso/flag conforme regra observada. A revisão não substitui validação do notebook/Bronze.
- Fonte preservada com o mesmo SHA-256; nenhuma correção aplicada ao CSV ou código. A adaptação da consulta atual e a avaliação com Gemini continuam pendentes. Nenhuma mensagem enviada ou publicação externa feita.
- Marco esclareceu que Matheus de Dados informou a sede em Porto Rico ao grupo; o contexto foi registrado com essa atribuição.

## Revisão de cenário em 14/11

- Lidas observações e transcrição da reunião de 13/11. Marco confirmou posteriormente, em 14/11, que o mentor Othon já aprovou o cenário internacional e a possibilidade de complemento simulado. Registrados os impactos e as demais pendências em [alinhamento-cenario-2026-11-14.md](alinhamento-cenario-2026-11-14.md).
- Conferência completa local da Silver confirmou cinco mercados, quatro classes de serviço e EUA/Porto Rico no campo `origem_cliente_pais`. Sem evidência suficiente para afirmar sede, origem de despacho, transporte físico ou causas de atraso.
- A versão recebida ainda contém coordenadas cuja retirada foi discutida na reunião. Conferir a última exportação e o dicionário antes da integração.
- Mudanças desta revisão são documentais: nenhum código, contrato HTTP ou dado histórico foi alterado; nenhum dado simulado adicional criado; nenhuma publicação externa feita. O prompt ainda usa a denominação anterior “TransLog Brasil”; consolidar o cenário antes da alteração de comportamento e dos testes correspondentes.

## Recebimento e inspeção em 13/11

- Repositório do grupo disponível: https://github.com/stephanielopes-ipnet/translog-logistica. Conector autenticado como `Marco-Leal96`, com permissão de contribuição confirmada. Nenhum push, PR ou comentário realizado.
- Silver recebida e copiada para `data/silver/silver_pedidos_rastreio.csv`, preservando o original e conferindo SHA-256: 41 colunas, 180.519 linhas de itens, 65.752 pedidos, nenhuma chave composta repetida detectada.
- Inspeção encontrou diferença semântica a resolver: `dias_atraso` admite negativos e permanece vazio em 79.510 linhas não avaliadas/canceladas, mesmo com dias preenchidos. O adaptador atual recalcula atraso não negativo nesses casos; não está validado para uso dessa Silver.
- Arquitetura do GitHub cita DuckDB, Gold e `/chat`; base local mantém banco pendente e API nativa ADK. Confirmar com o grupo na issue #1, sem promover esses textos a decisão aprovada.
- Configuração ativa preservada na amostra. Diagnóstico executado: chave Gemini ausente e índice revisado ausente. Nenhuma chamada ao Gemini realizada nesta inspeção.
- Roteiro, exemplos conferíveis, tarefas do GitHub e perguntas para o grupo em [roteiro-marco-13-11.md](roteiro-marco-13-11.md).

As dependências e verificações a seguir preservam o registro histórico de 12/11; recebimento da Silver e disponibilidade do remoto foram atualizados acima. A integração do código local ao remoto ainda está pendente.

## Implementado e verificado nesta base

- Python 3.12.14 e ambiente virtual local; dependências fixadas em `requirements.lock`.
- Consulta CSV sem LLM: validação de chaves, múltiplos itens, zeros à esquerda, nulos, atraso e origem. CLI de diagnóstico/validação/consulta.
- Chroma local: índices demo/revisado separados, publicação de revisão, reindexação sem duplicatas, retirada de documentos e esvaziamento da última política. Conteúdo inválido não substitui uma revisão válida.
- Agente ADK com duas ferramentas, instruções em português e tratamento de indisponibilidade.
- Contrato da API, cliente de exemplo e guia para Marco; sessões em memória para o MVP.
- API nativa iniciada em localhost: agente descoberto e sessão criada por HTTP, sem chamada externa ao modelo.
- Busca com embeddings reais locais: três perguntas em português recuperaram o item esperado entre os três trechos retornados, usando os oito textos sintéticos.

## Dependências externas deliberadas

- Silver: recebimento previsto em 13/11, ainda não recebida nesta pasta.
- Banco SQL: grupo ainda decidirá; nenhum conector definitivo será fingido.
- Chave/modelo e cotas: chamada real precisa de acesso local.
- FAQ e políticas revisadas: Stephanie/grupo fornecerão conteúdo. Exemplos são apenas teste.
- Portal e máquina da demo: integração depende de Matheus.
- Repositório remoto: Stephanie fornecerá URL; não criado aqui.

## Registro de execução

- Pasta inicial vazia e sem repositório; trabalho local preserva a decisão de um remoto único.
- Encontrado Python 3.12.14 no runtime local do Codex. A criação do ambiente precisou direcionar TEMP/TMP para `.cache/tmp` devido a permissão na pasta temporária padrão do sandbox.
- Testes de consulta/índice/cliente escritos antes da implementação. Regressões encontradas na revisão foram reproduzidas antes da correção.
- API de integração usa servidor/rotas/ferramenta reais e **modelo determinístico de teste**, não Gemini. A avaliação de linguagem natural continua pendente em `avaliacao.md`.
- No sandbox do Codex, testes de API precisaram de execução autorizada fora da restrição de sockets locais; o diagnóstico apontou `asyncio/socketpair`. Isso não exigiu acesso ao Gemini.
- Windows: dependência MSVC foi instalada apenas na `.venv`; o registro de diretórios de DLL é local ao processo.

## Limites importantes

- CSV é a implementação de desenvolvimento, não SQL real. O modo `sql_pending` informa indisponibilidade e não usa amostra como fallback.
- Embeddings/indexação não são avaliação do modelo generativo. Nenhuma das dez conversas foi marcada como aprovada sem Gemini e conteúdo final.
- O portal, o pipeline e o dashboard não foram implementados nesta frente.
- Não foram criados remoto Git, deploy, conta ou cobrança.

## Verificação final desta execução

- `python -m pytest -q --junitxml=.state/test-results.xml`: **30 passaram**, zero falhas; nove avisos de depreciação das dependências/testes.
- `python -m compileall -q src agents scripts tests`: passou.
- `python -m pip check`: nenhuma dependência quebrada.
- Script `scripts/setup.ps1`: executado com sucesso; configuração local criada com chave vazia, sem sobrescrever segredos existentes.
- Sintaxe PowerShell: validada pelo parser.
- Diagnóstico: sem chave Gemini configurada; índice real/revisado ausente; índice demo com oito documentos disponível apenas quando explicitamente selecionado.

Próximo passo de Marco: abrir `guia-marco.md`, executar `doctor` e `order 1001`, depois alinhar a Silver de 13/11, conteúdo e banco com o grupo. Não é necessário começar pelo Chroma ou pela API para entender a consulta.
