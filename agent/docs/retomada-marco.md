# Retomada do acompanhamento de Marco

## Ponto de entrada consolidado e autorização permanente — 17/11

Publicação desta consolidação concluída: código/FAQ/guias em `fdd5f31`, PR #32 atualizado em rascunho sem merge; 51 testes passaram no destino. A descrição agora reflete FAQ fechada, atendimento sem rodapés, localização e autorização permanente. Não usar o texto anterior do PR ou tratar ajustes recentes como ainda não publicados.

Para uma conversa nova, começar por **[inicio-nova-conversa.md](inicio-nova-conversa.md)** e ler `AGENTS.md`/`Agentes.md`. Os arquivos de instruções foram consolidados para remover decisões antigas que contradiziam o estado atual. O histórico abaixo permanece datado e não deve reabrir FAQ, escolha da fonte ou instruções de redação revogadas.

Marco autorizou expressamente manter ambos os arquivos de orientação atualizados e publicar no GitHub as mudanças necessárias ao projeto sem confirmação repetida para commits/push/PR dentro desse escopo. Repositório e conta permanecem os mesmos; não inclui segredos, dados privados, alterações alheias ou merge/deploy por inferência. O pacote desta atualização sincroniza FAQ fechada de 18 trechos, atendimento natural, ausência de rodapés, evidência de localização, 51 testes e guia de casos no PR #32. Conferir estado remoto antes de novas publicações.
## Mais recente — guia de casos salvo para o grupo e apresentação

Marco pediu salvar as perguntas sugeridas e a continuidade na mesma conversa para testar, mostrar ao grupo em 18/11 e usar como referência na apresentação. Guia completo: [casos-teste-e-apresentacao-agente.md](casos-teste-e-apresentacao-agente.md), com oito perguntas principais, cinco sequências, 15 adicionais, resultados esperados, seleção de demonstração e ficha para registrar evidências. README e roteiro técnico apontam para ele. Feedback positivo de Marco registrado sem marcar todos os casos como aprovados. Somente documentação; nenhum teste com modelo, reinício ou novo push nesta etapa.
## Mais recente — fonte/versão apenas nos registros técnicos

Marco não quer referência de FAQ/versão entre parênteses na mensagem do cliente. Prompt local atualizado: resposta normal não imprime fonte, versão, ID ou rodapé; Chroma e eventos preservam os metadados. Citar título/versão somente se o cliente perguntar a origem. Isso substitui instruções anteriores de referência visível/discreta obrigatória. Instância de testes segue porta 8003; após reinício, atualizar página e usar New Session. Reavaliação manual necessária; sem nova chamada automática ao Gemini ou push nesta etapa.
## Direção mais recente — atendimento do cenário da banca

Marco quer respostas ao cliente, não explicações técnicas do dataset em toda consulta. Instruções agora usam status/local comprovado do cenário de apresentação, sem repetir “amostra fictícia/base histórica/simulado”; origem segue registrada e deve ser explicada se perguntada. Preservar datas originais, sem inventar calendário atual/GPS. Essa é uma direção explícita do usuário e substitui a regra anterior de repetir simulação sempre. FAQ já fechada, fonte Databricks já alinhada; não reabrir decisões.

Pedido 16: Não pago (expirado), destino Brasília, apenas registro administrativo; `tracking.location=null`. Não dizer que está ou foi criado em Brasília. Ferramenta e prompt corrigidos, dois testes novos, suíte de 51 passou na etapa de localização. Relatório `ajuste-atendimento-apresentacao.md`. Reiniciar somente a instância dedicada 8003 para carregar as instruções, preservando 8001; Marco deve atualizar página e usar New Session após o reinício. Nenhuma chamada generativa adicional foi feita; resposta nova ainda precisa ser observada.
## Mais recente — FAQ fechada e teste local na porta 8003

Marco corrigiu em 17/11: FAQ já fechada e fonte SQL já alinhada. Não reabrir essas decisões. Confirmada no portal a escolha de 16/11: consumo_* no Databricks, CSV como alternativa local, sem banco próprio. Agente local é `csv_v2`; conexão SQL direta ainda não implementada é questão técnica distinta.

FAQ conciliada completa de 18 trechos indexada, versão `2-conciliada-2026-11-17`. Original preservado e oito orientações técnicas anteriores arquivadas. Corrigidos despacho/entrega, status pagamento/expiração, causas e limites de encaminhamento; horários da central e regra de atraso de entrega >=3/extravio agora ativos conforme o fechamento. Não dizer que a política está aguardando aprovação.

Instância dedicada de testes na pasta `translogbrasil`: http://127.0.0.1:8003 , agente `translog_agent`, com Silver v2 e FAQ atualizada. Processo registrado em `.state/adk-v2-8003.pid`; servidor da porta 8001 preservado. HTTP 200 e descoberta do agente conferidos. Marco quer testar bastante e retornar a Mateus de Dados; orientar pelo [roteiro com resultados esperados](roteiro-testes-silver-v2-faq.md), uma conversa nova por cenário. 49 testes e seis buscas Chroma passaram; novas conversas manuais ainda não avaliadas. Estas correções posteriores continuam locais, sem novo push ao PR #32.

## Publicação concluída — 17/11

Marco pediu atualizar o GitHub. [PR #32](https://github.com/stephanielopes-ipnet/translog-logistica/pull/32) publicado como rascunho em `feat/agente-silver-v2-rag`, sem merge; PR #30 já estava integrado. Código `01e8eb6`, preservando contexto do portal e padrão Gemini 3.5 Flash Lite da main. Repositório local do grupo está nessa branch, com 49 testes aprovados no destino. Nada de credenciais ou CSV privado foi publicado. Não repetir a publicação nem criar outro PR para o mesmo trabalho.

Próximo passo de Marco: teste conjunto com Matheus FullStack, na máquina da apresentação, com portal e agente usando a mesma v2. Conferir 1001 (quatro itens, entregue no prazo no cenário), pergunta mista com citação da FAQ, fonte histórica/simulada e comportamento de erro. Citação reforçada ainda precisa de reavaliação. Revisão final da FAQ com Stephanie e contingência 503 continuam pendentes; SQL/banco não foram escolhidos por esta publicação.

## Continuidade mais recente — Gemini autorizado e avaliado em 17/11

Marco respondeu “sim autorizo” ao envio mínimo de dados ao Google para as duas conversas descritas. Ambas executadas, sem 503; primeira correspondeu ao pedido 1001 da v2; segunda chamou consulta + Chroma, distinguiu despacho/entrega e não prometeu alteração de endereço, mas omitiu a citação. Instrução reforçada com formato de título/fonte/versão, sem nova inferência depois disso. [Avaliação e respostas](avaliacao-gemini-v2-2026-11-17.md). A autorização dessas duas chamadas foi atendida; não solicitá-la novamente. A omissão de citação continua pendente de reavaliação. Registros abaixo de avaliação bloqueada são históricos, anteriores à autorização.

## Atualização mais recente — Silver v2 integrada em 17/11

Mateus entregou o ZIP `silver_v2` com três tabelas; Marco também forneceu a FAQ de Stephanie e pediu continuar a integração. Backend local **`csv_v2` já ativado**, dados em `data/silver/v2-2026-11-17/`. Chroma ativo com oito orientações técnicas locais; original da FAQ continua rascunho, sem aprovar horários/encaminhamento/limiar de atraso. Marco confirmou 4/2/1 dias como despacho. Ver [relatório completo e casos](integracao-silver-v2-2026-11-17.md).

49 testes passaram; auditoria integral sem problemas nas verificações registradas; recuperação Chroma real demonstrada. Revisão independente encontrou e motivou correções de entrega negativa e auditoria de eventos. Inferência Gemini não realizada: revisão automática bloqueou transmissão de dados mínimos de pedido ao Google; solicitar autorização explícita para as duas perguntas descritas no relatório. **“Continue, retomei a conexão” não responde essa autorização.** Não contornar o bloqueio, não repetir onboarding ou pedir chave.

Nenhum servidor do usuário foi reiniciado. Após autorização/encerramento do teste atual, orientar reinício do ADK da pasta alterada e nova conversa; o 1001 da v2 difere do 1001 da amostra. As alterações ainda não foram publicadas no GitHub nem demonstradas na máquina do FullStack. SQL/banco e políticas comerciais finais continuam pendentes.

## Atualização de 17/11 — Gold anunciada e comunicação amigável

Marco informou que Mateus de Dados enviará a Gold e solicitou a lista de informações para tratamento. Lista priorizada, limites semânticos e mensagem pronta em [solicitacao-gold-mateus-2026-11-17.md](solicitacao-gold-mateus-2026-11-17.md). Nenhum arquivo novo recebido, schema aprovado ou fonte ativa alterada; banco continua pendente.

Tom amigável configurado localmente em `src/translog/agent_factory.py`: acolhedor/profissional, português simples, respostas curtas, empatia breve e uma pergunta por vez, preservando evidências e limites. [Guia de comunicação](comunicacao-agente.md) registra os cenários para reavaliação com Gemini e a necessidade de reiniciar o ADK da pasta alterada/abrir nova conversa. Nenhuma publicação ou alteração na máquina do colega. Não repetir onboarding ou chave. Validação técnica desta etapa em [status-implementacao.md](status-implementacao.md); não equivale a avaliação do estilo com LLM real.

Os registros seguintes preservam o acompanhamento iniciado em 14/11/2026 após o primeiro retorno com Gemini relatado por Marco.

## Atualização de 15/11 — conversa do grupo e próximo marco

### API local testada por Marco em 15/11

Após pedir como destravar a integração na prática, Marco iniciou `adk api_server agents --host 127.0.0.1 --port 8002 --no_use_local_storage` na pasta original e apresentou inicialização concluída. Depois executou `scripts/chat_demo.py 'Qual o status do pedido 1001?' --base-url http://127.0.0.1:8002`; apresentou JSON com IDs e answer correta: item 1, COMPLETE/Late delivery, 4/6 dias, 2 de atraso, amostra histórica simulada. Registro em `docs/teste-api-local-2026-11-15.md`. Isso confirma o fluxo local de cliente de exemplo pela API com o agente configurado, não a execução na máquina do FullStack ou portal integrado. O campo answer é produzido pelo script após extrair eventos; não mudar a descrição do formato nativo de /run. Não repetir configuração ou esse mesmo teste local sem motivo. Próximo: Matheus repetir no computador dele e implementar/alinha o adaptador backend→ADK; escolher fonte de teste comum, pois amostras do portal e agente são diferentes. Servidor API na porta 8002 pode continuar aberto no terminal do usuário; não encerrar sem necessidade.

Conferência posterior no GitHub, pedida por Marco: cinco branches confirmadas (`main`, `feat/agente-integracao`, `feat/dados-pipeline`, `feat/portal-api-e-contratos`, `feat/portal-interface`). Registro em `docs/revisao-branches-2026-11-15.md`. A branch da interface contém a do backend +3 commits; frontend usa chat demonstrativo (`mock-chat-service`), sem chamada ao ADK no envio lido. A documentação também marca integração HTTP de chat pendente. Agora há três notebooks SQL Bronze/Silver/qualidade de Mateus publicados; neles não aparece a nova tabela de trechos/cenários ou notebook Gold. Não afirmar que os novos eventos já estão no GitHub. Nenhum código executado ou repo alterado nesta inspeção. Próximo alinhamento concreto: agente na máquina do FullStack e adaptador backend→ADK, com contrato e fonte de teste comuns; solicitar de Dados o artefato dos eventos revisados. A main ainda não contém as alterações dessas branches na comparação realizada.

Complemento mais recente: Marco trouxe mensagens de 15/11 com resposta atribuída a Othon: pesquisar documentação e, se não esclarecer, seguir a abordagem justificada. Não interpretar como confirmação de que os dias reais medem despacho. Pesquisa do assistente localizou e leu o dicionário original dos autores no Mendeley; a descrição é breve e não resolve o marco final da duração. Registro e links em `docs/interpretacao-dataco-fontes-2026-11-15.md`, com cópia técnica do dicionário em `.state/referencias-dataco` (não o dataset completo). Próximo alinhamento de Dados: compartilhar essa fonte com Mateus, reconhecer limite e registrar hipótese versus fatos/eventos sintéticos. Nada foi enviado pelo assistente. A execução com Matheus FullStack usando amostra continua independente dessa definição; não alterar fonte/código por inferência.

Marco pediu interpretar novas mensagens e indicar o próximo passo. Registro em `docs/alinhamento-grupo-2026-11-15.md`: Stephanie assumiu preparar FAQ/políticas; Mateus de Dados relatou dois cenários e tabela com eventos simulados em revisão; FullStack tem portal → backend, mas ainda não executou agente. Não há novo arquivo/dicionário recebido neste registro ou confirmação do banco; texto sobre modal e pontos 1/2 incompleto. A aprovação geral de simulação por Othon já foi confirmada anteriormente; não reabrir. Próximo passo técnico recomendado: obter de Matheus FullStack a etapa e o erro da execução, sem chave, e validar agente com amostra antes da chamada do backend. Em paralelo, localizar a tabela revisada e conferir semântica/cenários com Mateus. Não adaptar código/dados por inferência.

Ponto didático efetivamente alcançado: Marco leu `INSTRUCTION`/`create_agent`, `consultar_pedido`, `consult_order`, `CsvOrderRepository.read_items` e `source`. Pediu parar após `source`; próximo ponto de leitura é `buscar_faq_e_politicas`. Em voz, perguntou pelos 30 testes e recebeu divisão conferida: 11 pedidos, 8 conhecimento, 9 diagnóstico/cliente, 2 API. Não retomar explicação desde a criação nem bateria de testes automaticamente. Este pedido novo trata do alinhamento do grupo.

## Ponto mais recente — explicação e alinhamento antes da API

### Prioridade atual: entendimento do agente, não novos testes

Marco pediu explicitamente pausar a sequência de testes e compreender por dentro a criação e execução do agente, o papel do ADK/Gemini/ferramentas/Chroma, quem escreveu/refinou o código e como visualizar a execução. Reconhecer a lacuna da orientação anterior e conduzir leitura acompanhada, uma parte por vez. Guia local em `docs/entenda-o-agente.md`. Primeiro passo: abrir `src/translog/agent_factory.py` no VS Code e entender `INSTRUCTION` e `create_agent`. Depois seguir a ferramenta até o CSV e localizar eventos/rastros no ADK Web, sem inventar rótulos. A tela local ADK Web que apareceu nos testes é diferente do AI Studio de credenciais e de hospedagem Cloud. Não exigir onboarding, nova chave, novas chamadas Gemini ou ativação de demo para começar a leitura. A pergunta de indenização anterior fica adiada; não retomar a bateria automaticamente.

Explicação central: assistente de desenvolvimento escreveu/refinou arquivos; Gemini responde no agente, que não depende deste chat durante execução. Ajuste de 1005 foi de duas linhas no prompt, não fine-tuning/treinamento. Na pergunta mista, a busca retornou por ausência de índice antes de consultar coleção Chroma; não houve recuperação vetorial nessa execução. Chroma está implementado para FAQ/políticas, não como fonte de pedidos; Silver ainda fora do agente.

### Pergunta mista do 1001 — atualização mais recente de 14/11

Marco apresentou resposta a “O pedido 1001 atrasou. Como devo proceder?” e os eventos de retorno: `consultar_pedido` encontrado, 4/6 dias e 2 de atraso, sample; `buscar_faq_e_politicas` unavailable por conhecimento não indexado neste modo. Ambas as ferramentas conferidas. Resposta reconhece ausência de diretrizes, mas usa “temporariamente indisponível” e sugere atendimento genericamente; refinar a redação para ausência de orientações revisadas nesta configuração, sem tratar sugestão genérica como política oficial. Nenhum código alterado neste registro. A passagem pela ferramenta sem índice não comprova recuperação de documento nem RAG conversacional completo. Próximo teste pequeno: “Existe indenização automática pelo atraso do pedido 1001?”, esperando reconhecimento de ausência de regra disponível. Conteúdo revisado, Silver e integração na máquina do FullStack permanecem pendentes; não habilitar demo automaticamente.

### Teste 1002 — atualização mais recente de 14/11

Marco apresentou resposta com os dados corretos do 1002: item 2, COMPLETE, Shipping on time, Second Class, Sul, 3 dias programados/3 registrados/0 de atraso, identificando amostra simulada/histórica. CSV conferido diretamente. Evento dessa execução não apresentado; aprovação limitada à resposta observada na amostra. Próximo passo pequeno: cenário misto “O pedido 1001 atrasou. Como devo proceder?”, mantendo configuração original sem índice revisado. Esperar consulta do pedido e busca de conhecimento com reconhecimento da indisponibilidade, sem inventar política/procedimento. Conferir resposta e depois eventos das duas ferramentas, sem habilitar demo automaticamente. Nenhum código, dado, chave ou servidor alterado neste registro.

### Teste 1005 — atualização mais recente de 14/11

Reavaliação concluída no recorte apresentado: Marco trouxe nova resposta à pergunta inicial após orientação de reinício/nova sessão; manteve “4 dias programados”, reconheceu a contagem desconhecida e não inventou data. Resposta atende ao cenário, sem aprovação geral ou evento novo observado. Ajuste de duas linhas e registro `agent/docs/avaliacao-1005.md` publicados no PR #30, commit `1bda182`, na mesma branch, sem merge. Suíte na pasta integrada: 30 passaram, 9 avisos, em 10,50 s, reutilizando a venv original com src do destino. Cópia do grupo limpa e sincronizada. As notas abaixo de ajuste ainda não publicado/reavaliação pendente são históricas. Próximo teste pequeno possível: 1002 (3 dias programados/3 registrados, sem atraso), enquanto aguarda atualização de Mateus de Dados e primeiro teste com Matheus FullStack. Não reiniciar onboarding ou ADK novamente sem necessidade.

Continuação posterior: Marco apresentou resposta em que o agente reconhece que a fonte não define dias úteis/corridos. A menção a busca de políticas indisponível ainda não tem evento apresentado. Instrução ajustada somente na pasta original (`src/translog/agent_factory.py`), exigindo fonte explícita para a classificação e evitando converter duração em chegada a partir de hoje. Próximo passo: reiniciar o ADK original, que carrega a instrução na criação do agente, e repetir a pergunta inicial de 1005 em nova conversa. Não declarar corrigido no Gemini antes desse retorno. A cópia integrada e o PR #30 ainda não receberam esse ajuste.

Suíte existente após o ajuste local: 30 passaram, 9 avisos, em 11,56 s, sem chamada ao Gemini. A reavaliação manual continua pendente. Reinício com sessões em memória apaga as conversas; os resultados apresentados já estão registrados em `avaliacao.md`.

Marco apresentou resposta do agente para 1005 sem inventar data, com status PROCESSING, item 6 e 4 dias previstos, mas acrescentando “dias úteis”, ausente na fonte. Posteriormente apresentou também o retorno de `consultar_pedido`: encontrado, `scheduled_days=4`, `actual_days=null`, `delivery_status=null`, `delay_days=null`, CSV/sample simulado e histórico. A consulta preservou a ausência; “dias úteis” foi acrescentado na redação do modelo. Cenário parcialmente correto, não aprovado integralmente. Próxima etapa pequena: perguntar ao agente se os dias são úteis ou corridos e qual fonte sustenta isso; esperar reconhecimento da lacuna. Depois revisar a instrução e reavaliar em nova conversa, sem pressupor regras novas. Registro em `docs/avaliacao.md`. Nenhum código/prompt alterado ou publicado nessa conferência.

### Retorno de Dados e correção do nome — atualização mais recente de 14/11

Usar **Mateus de Dados, sem H**, e **Matheus FullStack, com H**. Correção explícita de Marco substitui a grafia anterior. Mateus respondeu no grupo: atrasos vazios são de pedidos com pagamento não processado ou cancelados pelo cliente/por suspeita de fraude; versão recebida ainda era a atual no momento da resposta, mas planejava atualização em 14/11 e novas colunas na base final. Ofereceu chamada após enviar. Nova base ainda não recebida; não inferir definição de banco, fonte Silver/Gold, esquema ou mapeamento individual por status. Registro em `docs/alinhamento-dados-2026-11-14.md` e contrato atualizado parcialmente. Próximo: Marco aceitar a chamada após o envio e conferir exemplos/dicionário; continuar API/portal com amostra. Não alterar código ou fonte automaticamente.

### API concluída e publicada — atualização posterior de 14/11

Marco pediu concluir a documentação antes de redigir a mensagem ao FullStack. Dois guias foram concluídos, copiados para `agent/docs/` e publicados na branch `feat/agente-integracao`, com links no README: `api-chat.md` (contrato nativo ADK) e `guia-matheus-fullstack.md` (instalação, chave compartilhada, servidor e exemplo). Commit `122cea84986b48d8962085dfd8576a2d834417af`, enviado pelo Git local; o conector GitHub recusou escrita com 403, então foi usado o Git já autenticado. Conteúdo remoto dos três arquivos conferido contra o conteúdo preparado. PR #30 continua draft, sem merge; cópia local do grupo limpa e sincronizada após push.

Validação desta etapa: 11 testes existentes de API e CLI/cliente passaram, 3 avisos de depreciação; OpenAPI instalado confirmou as rotas e os campos do JSON de `/run`; opções conferidas no CLI. Sem chamada Gemini, sem leitura/cópia da chave e sem alterar comportamento do agente/portal. A primeira execução restrita demorou por limitações do ambiente; testes concluídos fora da restrição de sockets. Não repetir a instalação de Marco.

Preferência explícita atual de Marco: usar a chave Gemini já criada também na execução local de Matheus FullStack, por compartilhamento privado seguro. Não exigir nova chave ou conta do colega. Nenhum segredo foi transferido pelo assistente. Modelo indicado no guia: `gemini-3.5-flash-lite` na `.env` local, mantendo amostra ativa e conhecimento demo desligado.

Mensagem curta pronta em `docs/mensagem-matheus-fullstack-2026-11-14.md`, não enviada. Próximo: Marco encaminhar ao colega e combinar primeiro teste; execução independente e integração com o portal ainda pendentes. A documentação da API já está no PR: não descrevê-la novamente como ainda em preparação. As notas abaixo anteriores a esta atualização são históricas.

Esclarecimento posterior: Marco pediu instruções bem detalhadas sobre a chave para Matheus FullStack. Guia local criado em `docs/guia-matheus-chave-gemini.md`, com fontes oficiais consultadas: criar/usar chave Gemini no AI Studio não é criar uma nova API, e chave nova por computador não é obrigatória. Na execução local proposta, a credencial vai em `agent/.env`; não vai ao frontend. Guia inclui preparação, modelo usado por Marco, diagnóstico sem segredos e exemplo de teste por API. Ainda não está no PR e não foi executado na máquina do colega. Não ler nem copiar a `.env` de Marco para realizar essa documentação.

Marco pediu uma pausa na preparação da API para compreender como o agente foi criado, quais dados foram usados nos testes e se a entrega atende à atribuição. Conferência e explicação em `docs/explicacao-agente-apresentacao.md`; mensagem simples redigida em `docs/mensagem-grupo-avanco-ia-2026-11-14.md`, não enviada. Foi explicado que a entrega é parcial: ADK/Gemini e consulta fictícia demonstrados; Chroma implementado/testado tecnicamente, mas sem demonstração conversacional nas consultas apresentadas; SQL e adaptação à Silver pendentes. O arquivo temporário `silver.csv` de um teste é artificial, não a exportação de Dados.

A base já foi integrada em `agent/`, com commit `7e54bf1` e PR #30 em rascunho; Marco apresentou 30 testes aprovados no destino. Próximo passo: retomar a documentação da API para Matheus FullStack, uma etapa pequena por vez. Não repetir configuração, clonagem, commit ou criação do PR. Os registros anteriores abaixo são históricos e complementados por esta atualização.

## Como orientar

Marco é iniciante e quer orientação no VS Code, uma etapa pequena por vez: propósito, ação/comando, resultado esperado e conferência antes de avançar. Dispõe de até duas horas/dia. Não despejar o plano inteiro em cada resposta nem repetir instalação e configuração já concluídas.

Leia `AGENTS.md`, `Agentes.md`, `docs/plano-projeto.md`, `docs/decisoes.md` e `docs/status-implementacao.md`. Esta pasta local é `C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil`; ainda precisa ser integrada à pasta `agent/` do repositório único do grupo. Não criar remoto paralelo nem publicar por inferência.

## Ponto alcançado

- Marco abriu o projeto no VS Code e consultou `1001` pela CLI: encontrado, quatro dias previstos, seis registrados, dois de atraso, origem sample/simulada.
- A conta corporativa não permitiu criar projeto/chave. Marco criou uma chave em sua conta Google pessoal para avançar com a amostra fictícia e a guardou privadamente na `.env`. Nunca ler/imprimir o segredo nem pedir que ele o cole no chat.
- `gemini-3.8-flash` retornou `503 UNAVAILABLE`, alta demanda, repetidamente no ADK Web. Um retry manual não resolveu.
- Marco alterou `GEMINI_MODEL` para `gemini-3.5-flash-lite`, reiniciou e recebeu resposta ao pedido 1001. Fonte: resposta completa colada por Marco, não chamada ao modelo executada pelo assistente.
- Diagnóstico local posterior confirmou `model=gemini-3.5-flash-lite`, `api_key_configured=true`, `origin=sample`, backend CSV e ausência de índice aprovado. O diagnóstico não imprime a chave e não testa inferência/cota.
- Resposta relatada corresponde aos fatos: COMPLETE, Late delivery, Standard Class, Sudeste, quatro previstos, seis reais, dois de atraso; identifica histórico fictício e ausência de GPS ao vivo.
- Pequeno problema de redação: “amostra/política demo” mistura pedido e política. Essa consulta só precisa ser identificada como amostra fictícia/histórica. Registrar para revisão, sem presumir que política foi consultada.
- Ainda não foi conferido visualmente o evento de chamada a `consultar_pedido`. Um retorno bem-sucedido não conclui as dez conversas de avaliação.

## Execução conhecida

Na raiz local, PowerShell:

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\adk.exe web agents --port 8001 --no_use_local_storage
```

Interface: http://127.0.0.1:8001, agente `translog_agent`. Marco pode ter deixado o servidor aberto no terminal do VS Code; perguntar/verificar antes de iniciar outro na mesma porta. Ctrl+C encerra. Reinício apaga sessões nesse modo. Não encerrar seu servidor sem necessidade.

## Próximo passo recomendado

Começar reconhecendo o primeiro resultado e explicando que agora será verificada a ferramenta usada pelo agente. Guiar Marco para observar o evento `consultar_pedido`/resultado na interface; não inventar rótulos/botões se a versão da UI não for conhecida. Depois conduzir poucos cenários, um por vez:

1. Pedido 1004: preservar os dois itens da amostra.
2. Pedido 9999: reconhecer que não existe nessa fonte, sem inventar.
3. “Cadê meu pedido?” sem código: solicitar identificação.

Registrar resultados observados antes de marcar aprovação. Em seguida, priorizar integrar a base em `agent/` do repositório do grupo com testes e README no destino. A configuração de chave/ambiente não precisa ser refeita nesta pasta. O clone de inspeção em `.state/repo-grupo` foi feito sem checkout e não é pasta de trabalho.

## Contexto e dependências importantes

- Cenário internacional e simulação complementar aprovados pelo mentor Othon, conforme confirmação de Marco. Não retomar a aprovação como pendência.
- Sede em Porto Rico informada por **Matheus de Dados** ao grupo. Há também **Matheus FullStack**; identificar os dois pelo papel.
- GitHub: https://github.com/stephanielopes-ipnet/translog-logistica. Usar conta **Marco-Leal96**, com acesso de contribuição previamente conferido no conector. Login do VS Code/Git local é separado e deve ser conferido antes de publicar.
- Silver recebida e auditada: `data/silver/silver_pedidos_rastreio.csv`, 180.519 itens / 65.752 pedidos / 41 colunas. CSV ativo continua na amostra; não trocar automaticamente para a Silver.
- Auditoria em `docs/revisao-silver-2026-11-14.md` e mensagem pronta em `docs/mensagem-dados-revisao-silver-2026-11-14.md`. Nada foi enviado ao grupo pelo assistente. Ajustes/dicionário/última exportação ainda dependem de Dados.
- Preservar 79.510 nulos de atraso/flag; a consulta da amostra ainda recalcula diferença automaticamente e não está semanticamente adaptada à Silver. Coordenadas não são GPS. Data de envio não comprova entrega.
- Banco final e conciliação de API nativa ADK com `/chat` continuam pendentes. DuckDB aparece em documentos do grupo, mas não foi confirmado como escolha nesta conversa.
- FAQ/políticas revisadas e integração do portal continuam pendentes. Chroma demo é separado e não está habilitado na configuração atual.
- Extra interno de rotas, P80, classes ouro/prata/bronze e um ou dois agentes continuam propostas. Ver `docs/revisao-propostas-whatsapp-2026-11-14.md`. Não ampliar o MVP automaticamente.
- Não houve nova execução da suíte de testes nesta etapa. Os 30 testes registrados anteriormente são evidência histórica da base, não dez conversas aprovadas com Gemini.

## Segurança e continuidade

Não incluir `.env`, `.venv`, Silver completa, caches ou índices em commits. Não copiar segredos para relatórios. Preservar a pasta atual e os documentos do grupo ao integrar. Ao final de cada bloco, registrar feito/próximo/bloqueio e atualizar este ponto de retomada se necessário.

## Continuidade após os testes acompanhados — 14/11/2026

Marco apresentou o evento de retorno de `consultar_pedido` para 1001: encontrado, 4 previstos/6 registrados/2 de atraso, CSV/sample identificado como simulado e histórico. Apresentou também respostas para 1004 (dois itens corretos, conferidos no CSV local pelo assistente), 9999 (não encontrado) e pergunta sem código (solicitou identificação). Os eventos das ferramentas desses novos testes não foram apresentados. Detalhes e limites em `avaliacao.md`, seção “Bloco de avaliação acompanhado”. Nenhuma chamada ao Gemini nem suíte automatizada executada pelo assistente neste bloco.

Próximo passo prioritário: orientar a integração da base em `agent/` do repositório único, uma etapa pequena por vez, sem repetir chave/ambiente. Os demais cenários de avaliação continuam pendentes. A redação “amostra/política demo” persiste na resposta do 1004; ajuste ainda não implementado.

## Integração publicada como rascunho — 14/11/2026

Marco clonou o repositório do grupo em `C:\Users\marco.leal_ipnet\Documents\Codex\translog-logistica`, criou `feat/agente-integracao` e copiou a base para `agent/`, preservando o README coletivo e demais áreas. Incluídos código, scripts, testes, amostra, knowledge demo/templates, arquivos de instalação e README local; não incluídos `.env`, `.venv`, Silver ou caches.

Primeiro teste no destino: 18 passaram e 12 erros de preparação porque `.cache` não existia (`--basetemp=.cache/pytest`). Após criar `.cache`, Marco apresentou `30 passed, 9 warnings in 4.80s`. Ambiente Python original reutilizado com `src` do destino priorizado; instalação independente no destino ainda não verificada. `setup.ps1` já cria `.cache/tmp`. Linhas vazias finais removidas e `git diff --cached --check` sem problemas relatado.

Commit `7e54bf1a2a0c74f3026b45ad7b85cb4374da7589`, 25 arquivos, enviado por Marco. PR https://github.com/stephanielopes-ipnet/translog-logistica/pull/30 conferido pelo conector: aberto, draft=true, autor Marco-Leal96, head feat/agente-integracao, base main, merged=false. Descrição registra testes e limites da avaliação manual. Nenhum merge realizado.

Feito: base integrada à cópia de trabalho e publicada em PR rascunho. Próximo: levar/documentar o contrato de API para Matheus FullStack e verificar reprodução independente antes de concluir revisão; avaliar vínculo à issue do grupo sem inventar número. Os documentos de API/contrato desta pasta ainda não foram copiados para `agent/docs`. Ajuste da expressão “amostra/política demo” continua pendente. Não repetir onboarding, clonagem ou criação do PR. Manter orientação em etapas pequenas.
