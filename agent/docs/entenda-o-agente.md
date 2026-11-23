# Entenda o agente TransLog: leitura acompanhada

Atualizado em 14/11/2026. Marco pediu pausar novos testes para entender o código e observar a execução. Este guia descreve a implementação atual, sem mudar código, modelo, fonte, chave ou servidor.

## 1. Quais programas estão envolvidos

| Parte | Papel na execução atual |
| --- | --- |
| Assistente de desenvolvimento no Codex | Escreveu a base e auxilia Marco na leitura, nos testes e nos ajustes. Não responde às mensagens do ADK Web durante o atendimento. |
| Agente TransLog | Aplicação Python definida no projeto, com instruções, duas ferramentas e um modelo configurado. |
| Google ADK | Biblioteca instalada no ambiente Python que carrega o agente, organiza a conversa, chama o modelo e executa ferramentas solicitadas. |
| Gemini | Modelo acessado por API que interpreta a mensagem, solicita ferramentas e redige respostas. Modelo informado nos testes: `gemini-3.5-flash-lite`. |
| ADK Web | Interface local de desenvolvimento para conversar e observar eventos e rastros de execução. |
| Google AI Studio | Serviço usado para obter/gerenciar a chave Gemini; não foi onde a lógica Python deste agente foi construída. |

O nome é Google ADK, sigla de Agent Development Kit. A interface vista no VS Code nos testes, intitulada Agent Development Kit Dev UI, é o ADK Web local. Seu endereço `http://127.0.0.1:8001` aponta para o próprio computador. O aplicativo Python executa localmente; o Gemini é chamado por API. Usar ADK não significa que a aplicação já foi hospedada no Google Cloud.

## 2. O que define o agente

O arquivo [agent_factory.py](../src/translog/agent_factory.py) importa `Agent` de `google.adk.agents`. A função `create_agent` monta um objeto com:

- `name`: `translog_agent`, nome mostrado pela interface.
- `model`: selecionado na configuração; os testes técnicos podem substituí-lo por um modelo determinístico.
- `instruction`: texto `INSTRUCTION`, que orienta o atendimento e os limites da resposta.
- `tools`: funções Python autorizadas para obter informações, `consultar_pedido` e `buscar_faq_e_politicas`.

Em [agents/translog_agent/agent.py](../agents/translog_agent/agent.py), `root_agent = create_agent()` fornece a entrada que o ADK carrega. Iniciar `adk web` não reescreve esse código nem treina o Gemini; inicia a aplicação definida nesses arquivos.

Instruções ajudam a guiar o modelo, mas não garantem obediência em toda resposta. Por isso são necessárias restrições nas ferramentas e avaliação das respostas. O termo “autônomo” aqui se refere à escolha de ferramentas durante o atendimento, não a monitoramento contínuo ou alteração livre de pedidos.

## 3. O caminho de uma pergunta

Exemplo: “Qual o status do pedido 1001?”

1. Marco envia a mensagem pela tela ADK Web.
2. O ADK prepara a solicitação ao Gemini com as instruções, o contexto da sessão e as descrições/argumentos das ferramentas disponíveis.
3. O Gemini pode solicitar `consultar_pedido` com `order_id="1001"`. Isso é uma chamada estruturada de função; não é o modelo abrindo o CSV diretamente.
4. O ADK executa a função Python registrada. Em [tools.py](../src/translog/tools.py), ela escolhe o repositório configurado; em [orders.py](../src/translog/orders.py), o código lê o CSV, valida a fonte e seleciona os itens do código exato.
5. A consulta devolve um dicionário: pedido encontrado, itens, valores e identificação de origem. A regra da amostra calcula 6 dias registrados menos 4 programados, resultando em 2 de atraso. Só campos selecionados dos itens encontrados são retornados, não o CSV completo.
6. O ADK incorpora o resultado ao fluxo de conversa e o modelo pode redigir a resposta ou solicitar outra ferramenta. Pode haver várias interações com o modelo para responder uma única pergunta.
7. O texto final aparece na interface, e os eventos permitem conferir chamadas e resultados.

Para uma pergunta sem código, o modelo pode responder pedindo identificação, sem consultar um pedido. Para uma pergunta mista, pode solicitar ambas as ferramentas. A ordem e a quantidade de chamadas podem variar; não é uma sequência rígida de respostas pré-escritas.

O modelo pode errar ao interpretar ou redigir mesmo quando a ferramenta retornou dados corretos. No teste 1005, por exemplo, o retorno continha “4 dias” sem calendário, mas a resposta acrescentou “dias úteis”. Esse foi um acréscimo do modelo, não um dado da consulta.

## 4. Onde entra o Chroma

O Chroma é um banco vetorial utilizado neste projeto para FAQ e políticas. Ele não é o modelo que escreve a resposta nem é o banco de pedidos atual.

Há duas atividades diferentes:

**Preparar a busca (indexação):** ler os textos, conferir metadados, gerar embeddings e armazenar textos/vetores no Chroma. Um embedding é uma lista de números usada para comparar semelhança entre textos. Em [knowledge.py](../src/translog/knowledge.py), o padrão usa o modelo local `ONNXMiniLM_L6_V2`, separado do Gemini.

**Consultar durante o atendimento:** a ferramenta `buscar_faq_e_politicas` recebe a pergunta, usa o índice ativo para buscar até três trechos semelhantes e devolve texto, fonte e versão. O Gemini pode então redigir uma resposta apoiada nesses trechos. Esse caminho de recuperação para apoiar a geração é o RAG; os trechos candidatos ainda precisam sustentar a resposta, pois semelhança não garante relevância.

No teste “1001 atrasou. Como devo proceder?”, observamos:

- A consulta estruturada encontrou o pedido na amostra.
- A ferramenta de FAQ verificou que não havia conhecimento indexado no modo ativo e retornou `unavailable`.
- Essa mensagem ocorre antes de a implementação consultar uma coleção Chroma. Portanto, nesse caso houve tentativa de usar a ferramenta de conhecimento, mas não houve recuperação vetorial efetiva de documentos.

O projeto tem exemplos demo separados e registro de testes técnicos do Chroma. O modo demo não está habilitado no atendimento atual. Ainda falta o conteúdo revisado de FAQ/políticas, coordenado por Stephanie. A Silver de Mateus de Dados não foi indexada no Chroma, nem conectada à consulta atual; os pedidos dos testes vêm da amostra fictícia.

## 5. Quem fez e quem refinou

O assistente de desenvolvimento escreveu a base Python e os testes com apoio do contexto e das decisões fornecidas por Marco. Marco configurou a credencial privadamente, executou o aplicativo e apresentou resultados das conversas. Esses resultados orientaram a revisão.

No ajuste recente de 1005, o assistente alterou explicitamente duas linhas de `INSTRUCTION`: exigir fonte para classificar dias como úteis/corridos e não transformar duração em chegada a partir de hoje. O ajuste foi testado tecnicamente, reavaliado com uma resposta apresentada por Marco e publicado na branch do PR #30, commit `1bda182`. Ver [avaliacao-1005.md](avaliacao-1005.md).

Isso é refinamento de instrução/prompt. Não houve fine-tuning, treinamento dos pesos do Gemini ou aprendizado permanente a partir da conversa. Corrigir uma resposta numa sessão pode mudar as respostas seguintes daquela sessão por contexto; não equivale a mudar o programa para novas sessões. A mudança permanente no aplicativo ocorre quando o arquivo de instruções é alterado e carregado novamente.

O agente não se modifica sozinho a cada teste. O assistente de desenvolvimento também não é uma dependência do atendimento: durante uma conversa, a aplicação usa ADK, Gemini e as ferramentas do projeto.

## 6. O que os testes comprovam

- A suíte técnica usa amostra e arquivos artificiais, não a Silver. Quando precisa de um modelo, utiliza um modelo determinístico para verificar a integração sem chamar Gemini.
- Os testes Chroma da suíte usam o banco Chroma e embeddings controlados de teste; há registro separado de busca com embeddings reais e textos demo.
- As respostas que Marco apresenta do ADK Web são avaliação manual com Gemini. Elas precisam ser conferidas contra eventos e fonte.
- Os 30 testes aprovados não comprovam 30 conversas corretas com Gemini, uso da Silver ou portal integrado.

## 7. Como observar sem apenas aceitar a resposta final

| Visão | O que observar | Limite |
| --- | --- | --- |
| Código no VS Code | Como o agente é criado; instruções; funções de consulta | Mostra o programa, não o que uma execução específica fez |
| Events no ADK Web | Mensagem, nome/argumentos das chamadas, resultados e texto final | Nem todo evento é uma resposta destinada ao cliente |
| Traces no ADK Web | Operações da execução e seus tempos, conforme os rastros disponíveis | Não é acesso garantido ao raciocínio interno completo do modelo |
| Terminal do servidor | Requisições e erros operacionais | Não substitui conferir dados e conteúdo da resposta |
| API `/docs` | Endpoints e formatos de entrada/saída | Explica como integrar; não comprova qualidade de resposta |

Events e Traces foram vistos como abas na versão de interface apresentada por Marco. Detalhes de navegação devem ser guiados a partir do que estiver efetivamente visível, sem inventar botões. A inspeção pode ser feita sem enviar nova pergunta nem consumir uma nova chamada de modelo.

## 8. Ordem da leitura acompanhada

Primeiro, abrir `src/translog/agent_factory.py` no VS Code e compreender `INSTRUCTION`, `create_agent` e os argumentos de `Agent`. Depois acompanhar `consultar_pedido` até o CSV. Em seguida, localizar esses mesmos passos em uma conversa já existente no ADK Web. Por último, compreender indexação e busca Chroma e fazer uma demonstração controlada, com exemplos identificados, se for combinado.

Não continuar a bateria de testes ou ativar demo automaticamente enquanto Marco estiver pedindo foco no entendimento. A pergunta de indenização proposta anteriormente pode esperar. Não é necessário instalar novamente, recriar chave, abrir projeto Cloud ou reiniciar o servidor só para ler o código e inspecionar os eventos existentes.

Referências oficiais: [agentes LLM e ferramentas no ADK](https://adk.dev/agents/llm-agents/) e [execução de agente Python/ADK Web](https://adk.dev/get-started/python/), consultadas em 14/11/2026. Para comportamento específico, prevalecem os arquivos e a versão fixada do projeto.
