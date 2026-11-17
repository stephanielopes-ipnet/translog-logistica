# Teste da API local com Gemini — 15/11/2026

## Resultado observado

Marco iniciou o servidor nativo ADK na pasta original `translogbrasil`, porta 8002, e apresentou o log de inicialização concluída. Em outro terminal, executou o cliente de exemplo e apresentou o retorno com identificadores de usuário/sessão e `answer`.

A resposta informou pedido 1001, item 1, COMPLETE, Late delivery, Standard Class, Sudeste, 4 dias programados, 6 registrados e 2 de atraso. Identificou o registro como amostra histórica simulada, sem rastreio ao vivo ou confirmação de data de entrega.

**Resultado:** fluxo local cliente de exemplo → API ADK → agente → resposta final funcionou no resultado apresentado por Marco. O script usa o agente configurado e não injeta o modelo determinístico dos testes. Fonte: saída de terminal apresentada por Marco; nenhuma inferência foi executada pelo assistente nesta etapa. O resumo retornado não mostra o identificador do modelo nem os eventos internos; o último modelo informado no acompanhamento é `gemini-3.5-flash-lite`.

## Reprodução no Windows

Pré-requisito: cópia do agente com `.venv` preparada e `.env` privada configurada. Todos os comandos abaixo partem da pasta raiz da aplicação de IA, que na cópia do repositório do grupo é `agent`.

Terminal 1, manter aberto:

```powershell
.\.venv\Scripts\adk.exe api_server agents --host 127.0.0.1 --port 8002 --no_use_local_storage
```

Terminal 2, na mesma pasta:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'Qual o status do pedido 1001?' --base-url http://127.0.0.1:8002
```

A porta 8002 foi escolhida para separar o servidor de API da interface de desenvolvimento usual em 8001. Os avisos sobre ausência de recarga no Windows e serviços em memória não impediram o teste apresentado. As sessões desse servidor se perdem ao encerrá-lo.

O script cria uma sessão nova, envia a pergunta e extrai a resposta final. **`answer` é a saída adaptada pelo script; `/run` nativo continua retornando uma lista de eventos ADK.** O backend do portal deverá fazer a mesma sequência e adaptar os eventos, conforme [api-chat.md](api-chat.md).

## O que este teste não comprova

- Instalação independente e acesso ao Gemini no computador de Matheus FullStack.
- Integração do chat do portal com ADK; o código inspecionado da interface ainda usa um serviço demonstrativo local.
- Uso da Silver, da tabela de eventos simulados ou recuperação de políticas no Chroma. A resposta utilizou a amostra fictícia de pedidos.
- Coincidência entre pedidos de mesmo código nas amostras do portal e do agente. O portal possui exemplos próprios baseados na Silver; o pedido 1001 da amostra do agente não deve ser equiparado automaticamente ao 1001 de outra fonte.

## Próximo passo conjunto

Matheus FullStack repetir esse cliente na própria máquina, com o agente preparado conforme [guia-matheus-fullstack.md](guia-matheus-fullstack.md), configurando a chave que Marco decidiu compartilhar por meio privado. Depois, ligar o backend ao mesmo fluxo: criar sessão, chamar `/run`, extrair resposta final e devolver ao frontend. Manter IDs por usuário/conversa e combinar uma fonte de teste comum para que painel e chat mostrem os mesmos registros.

O endereço de loopback aponta para a máquina que faz a chamada: o servidor local de Marco não fica disponível automaticamente no computador do colega. A configuração conjunta deve usar o servidor do agente na máquina do backend para este primeiro teste, ou um endereço/rede acordados em outra etapa.

Não houve alteração de código, banco ou configuração privada pelo assistente ao registrar este teste. Nenhuma suíte foi reexecutada; este registro é a evidência manual de integração local apresentada por Marco.
