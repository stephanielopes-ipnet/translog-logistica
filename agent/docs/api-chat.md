# API de chat — contrato de integração v0.1

Atualizado em 14/11/2026 para Google ADK **2.14.1**, versão fixada no projeto. Este documento descreve a API nativa existente; não cria um endpoint adicional no portal.

## Endereço e execução

| Item | Valor |
| --- | --- |
| Base local | `http://127.0.0.1:8001` |
| Nome da aplicação/agente | `translog_agent` |
| Tipo de envio deste guia | HTTP JSON por `POST /run`, sem streaming |
| Referência completa da versão instalada | `GET /openapi.json` e interface `GET /docs` |

No PowerShell, dentro de `agent`, após preparar o ambiente e configurar a chave local:

```powershell
.\.venv\Scripts\adk.exe api_server agents --host 127.0.0.1 --port 8001 --no_use_local_storage
```

Manter esse terminal aberto. Não executar `adk web` e `adk api_server` simultaneamente na porta 8001. O [guia do FullStack](guia-matheus-fullstack.md) explica preparação, chave e teste completo.

O primeiro teste usa agente e backend na mesma máquina. `127.0.0.1` aponta para o computador de quem executa a chamada; o endereço do computador de Marco não disponibiliza o agente no computador de Matheus. O navegador chama o backend do portal; o backend chama a API do agente. Esta configuração de loopback é para integração local, sem exposição pública.

As conversas ficam em memória com `--no_use_local_storage`: reiniciar o processo apaga as sessões e exige recriá-las. Isso não define o banco dos pedidos. A chave Gemini fica em `agent/.env`; ela não faz parte do JSON enviado à API e não deve ir para o frontend.

## 1. Criar uma conversa

Antes da primeira mensagem, o backend cria uma sessão:

```http
POST /apps/translog_agent/users/demo-usuario-1/sessions/demo-conversa-1
Content-Type: application/json

{}
```

Os identificadores acima são exemplos. Para uma nova conversa, gerar um identificador de sessão novo, como um UUID, e associá-lo ao usuário correto no backend. Repetir a criação com o mesmo identificador pode causar conflito. Para continuar a conversa existente, reutilizar os mesmos IDs sem criar novamente a sessão.

O backend é responsável por identificar o usuário, manter essa associação e impedir acesso a sessões alheias. Não usar uma única sessão compartilhada por todos os clientes e não confiar em um `user_id` arbitrário vindo do navegador.

A rota acima funciona na versão fixada, mas emite aviso de depreciação. Ela foi mantida por compatibilidade com o exemplo e os testes atuais. Conferir o OpenAPI e repetir os testes antes de atualizar o ADK ou migrar a rota.

## 2. Enviar uma mensagem

```http
POST /run
Content-Type: application/json
```

Corpo JSON, com os mesmos identificadores da sessão criada:

```json
{
  "appName": "translog_agent",
  "userId": "demo-usuario-1",
  "sessionId": "demo-conversa-1",
  "newMessage": {
    "role": "user",
    "parts": [
      {"text": "Qual o status do pedido 1001?"}
    ]
  }
}
```

O campo `text` contém a mensagem completa em linguagem natural. Não é necessário um campo separado de código do pedido neste contrato. O agente solicita o código quando estiver ausente.

O backend deve aguardar o término dessa chamada antes de enviar outra mensagem à mesma sessão. O cliente de exemplo usa timeout de 60 segundos; esse valor é uma configuração do cliente, não um prazo de resposta garantido do Gemini.

## 3. Ler o retorno e entregar a resposta ao portal

O retorno nativo de `/run` é uma **lista de eventos ADK**. Ela pode conter chamadas e resultados de ferramentas, erros e a resposta final. O ADK não retorna diretamente um objeto `{"answer": "..."}` neste endpoint.

Exemplo simplificado de um evento final, dentro dessa lista — apenas ilustração do formato, não saída literal de uma inferência:

```json
[
  {
    "content": {
      "role": "model",
      "parts": [
        {"text": "Na amostra fictícia, o pedido 1001 registra 2 dias de atraso."}
      ]
    }
  }
]
```

No backend, extrair somente o texto final público. A referência já implementada em Python é `src/translog/client.py`:

```python
from translog.client import extract_final_text

events = response.json()
answer = extract_final_text(events)
```

Nesse trecho, `response` representa a resposta HTTP bem-sucedida do `POST /run`; ver a chamada completa em `scripts/chat_demo.py`. Se o backend estiver em outra linguagem, reproduzir a lógica e os casos de teste, em vez de mostrar o JSON inteiro:

- Rejeitar eventos com `errorCode`/`error_code`.
- Verificar o último evento com conteúdo; ele precisa ser uma resposta final de `role=model`, sem `partial` ou `interrupted`.
- Não transformar uma chamada/retorno de ferramenta ainda sem conclusão em resposta final.
- Extrair partes textuais públicas, excluindo partes marcadas como `thought`.
- Se não houver resposta final válida, tratar como falha; não recuperar uma frase intermediária anterior como se fosse sucesso.

O backend pode devolver um objeto simples de resposta ao frontend conforme o contrato já adotado pelo portal. O formato desse adaptador e eventual rota `/chat` precisam ser alinhados com Matheus FullStack; **não existe um `/chat` adicional implementado neste agente**. O script de exemplo imprime `user_id`, `session_id` e `answer` depois de adaptar os eventos — essa saída é do script, não o formato nativo de `/run`.

## 4. Testar sem o portal

Com a API aberta em um terminal, executar em outro PowerShell dentro de `agent`:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'Qual o status do pedido 1001?'
```

Esse exemplo cria IDs novos com UUID, cria a sessão, envia a pergunta e imprime a resposta final. **Ele chama Gemini**, ao contrário dos testes automatizados. Manter os IDs retornados para uma pergunta de continuidade:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'E o pedido 1004?' --user-id ID_USUARIO_RETORNADO --session-id ID_SESSAO_RETORNADO --reuse-session
```

Substituir os marcadores pelos IDs reais, sem inventar um identificador novo ao continuar a conversa. Após reiniciar o servidor, iniciar uma nova conversa sem `--reuse-session`.

## 5. Estados da fonte e erros

| Situação | Comportamento esperado |
| --- | --- |
| Pedido encontrado | Responder com os dados retornados e identificar a fonte |
| `not_found` | Informar não encontrado nessa fonte; não afirmar inexistência em todos os sistemas |
| `invalid_input` | Pedir um código de pedido válido |
| `unavailable` na ferramenta | Informar indisponibilidade; não confundir com pedido inexistente |
| Conhecimento ausente ou sem trecho que sustente a orientação | Reconhecer que a regra não está disponível, sem inventar política |
| Sessão perdida após reinício | Criar uma nova conversa e informar a perda do contexto quando aplicável |
| Falha HTTP, timeout, modelo, credencial ou cota | Mostrar falha de atendimento clara e registrar o erro técnico no backend sem expor credenciais |

Os estados da ferramenta podem aparecer dentro de uma chamada HTTP bem-sucedida: não se resumem ao status HTTP. Um HTTP 200 tampouco garante que a lista de eventos contenha uma resposta final válida. Conferir ambos.

Não repetir o envio automaticamente quando não se sabe se a mensagem já foi processada. Não exibir chamadas internas, pensamentos, caminhos privados, logs ou segredos ao cliente. As ferramentas atuais não alteram cadastro, não reagendam e não escrevem em banco.

## 6. Dados usados e evidência de validação

O primeiro teste de integração usa a **amostra fictícia/histórica** de `data/samples/orders.csv`, não a Silver recebida de Dados. FAQ/políticas revisadas e conector SQL continuam pendentes; a configuração padrão não habilita o corpus demo. Consulta de pedido é estruturada, não uma busca vetorial dos pedidos.

Em 14/11/2026, a conferência para esta documentação executou os testes existentes de API e CLI/cliente: **11 passaram, 3 avisos de depreciação**. As rotas ADK e a ferramenta são reais; o modelo é determinístico de teste e não usa Gemini. Também foram conferidos os argumentos no `adk api_server --help`. O teste com Gemini e a execução na máquina de Matheus FullStack continuam pendentes nesta etapa. Nenhuma credencial foi incluída nos exemplos.
