# Guia prático de Marco

Siga uma etapa de cada vez. Volte ao [plano](plano-projeto.md) para alinhar prazos. Todos os comandos abaixo partem da raiz `C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil`. Um terminal mostra o comando e sua saída; não copie uma mensagem de erro como comando.

## 1. Ambiente

Se o ambiente `.venv` desta implementação já estiver disponível, use seus executáveis. Para recriar, instale Python 3.12 ou indique ao script um executável Python 3.12 disponível:

```powershell
Set-Location 'C:\Users\marco.leal_ipnet\Documents\Codex\translogbrasil'
py -3.12 --version
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock -e '.[dev]'
```

Alternativa: executar `scripts/setup.ps1`, que aceita `-Python` com o caminho do Python. Não é necessário ativar o ambiente nem mudar políticas globais de execução do Windows. Caso a política local impeça rodar o script, use os comandos acima e peça apoio para a configuração, sem alterar configurações corporativas por conta própria.

O ambiente criado pelo assistente usa o Python 3.12.14 fornecido pelo aplicativo. Se uma atualização remover esse runtime, recrie a `.venv` usando uma instalação estável de Python 3.12. A pasta `.venv` não vai para o GitHub.

No Windows, o pacote `msvc-runtime` fornece DLLs usadas pelo Chroma dentro da própria `.venv`; o projeto registra esse diretório no processo, sem alterar o Windows global.

Resultado esperado: `python -m translog.cli doctor` funciona, informa apenas se há chave (não seu conteúdo), fonte dos pedidos e índice de conhecimento.

## 2. Consultar um pedido sem IA e sem banco definitivo

```powershell
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli order 9999
.\.venv\Scripts\python.exe -m pytest tests/test_orders.py -q
```

1001 tem seis dias reais e quatro previstos: atraso observado de dois dias. 9999 não existe. `source.origin=sample` deixa claro que é exemplo. O arquivo tem sete linhas de itens e seis pedidos distintos; 1004 possui dois itens e 0007 preserva zeros.

## 3. Receber a Silver em 13/11

Criar `data/silver/` e guardar o arquivo recebido localmente (essa pasta é ignorada). Copiar `.env.example` para `.env` caso ainda não exista; não sobrescrever uma configuração existente sem conferência.

Configurar na `.env`:

```dotenv
TRANSLOG_ORDER_BACKEND=csv
TRANSLOG_ORDERS_CSV=data/silver/entregas.csv
TRANSLOG_DATA_ORIGIN=silver
TRANSLOG_CSV_ENCODING=utf-8-sig
TRANSLOG_CSV_DELIMITER=,
```

Conferir o formato com o responsável. Se os nomes diferirem, criar JSON de mapeamento e indicar seu caminho em `TRANSLOG_COLUMN_MAP`. Não renomear ou interpretar uma coluna sem confirmar o significado. Para CSV latin-1 ou com ponto e vírgula, ajustar encoding/separador explicitamente.

```powershell
.\.venv\Scripts\python.exe -m translog.cli validate-orders
.\.venv\Scripts\python.exe -m translog.cli order CODIGO_REAL_CONFERIDO
```

O segundo comando exige trocar o texto de exemplo por um código verdadeiro. A validação mostra contagens, sem despejar o arquivo inteiro ou dados pessoais. Não marcar SQL como pronto: banco e conector ainda dependem do grupo.

## 4. Aprender Chroma usando FAQ e políticas fictícias

```powershell
.\.venv\Scripts\python.exe -m translog.cli index --input knowledge/demo --demo
.\.venv\Scripts\python.exe -m translog.cli search 'Posso alterar o endereço?' --demo
```

Resultado: trechos com título, tipo, fonte, versão e aviso de simulação. O modelo de embeddings roda localmente e é baixado na primeira execução para `.cache/models`. Depois o cache é reutilizado. Se o download falhar por rede corporativa, peça apoio; não troque por uma API paga sem combinar.

Para o agente usar esse corpus, alterar **somente no teste** `TRANSLOG_ALLOW_DEMO_KNOWLEDGE=true` na `.env` e reiniciar o servidor. O padrão é `false` para não confundir exemplos com políticas revisadas.

## 5. Indexar o conteúdo revisado da Stephanie

1. Usar `knowledge/templates/atendimento.json` como formato.
2. Preencher os textos e metadados após a revisão do grupo.
3. Colocar JSON em `knowledge/approved/` com `status=approved` e `approved_by` preenchido.
4. Manter `TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false`.

```powershell
.\.venv\Scripts\python.exe -m translog.cli index --input knowledge/approved
.\.venv\Scripts\python.exe -m translog.cli search 'Como funciona a entrega?'
```

Reindexar publica uma nova revisão ativa e não mantém documentos retirados na busca atual. A revisão anterior fica preservada caso a nova entrada seja inválida. Consulta retorna candidatos, não prova automática de que eles respondem à pergunta.

Para retirar todo o conteúdo ativo, reindexar um JSON válido `[]` ou o diretório existente já vazio publica um índice vazio. Um caminho inexistente ou JSON inválido é erro e preserva a última revisão válida.

## 6. Conversar no ADK Web

Preencher `GOOGLE_API_KEY` na `.env` raiz com seu acesso autorizado. Não enviar o valor por chat nem colocá-lo no repositório. O modelo configurável começa em `gemini-3.8-flash`; confirmar acesso/cotas.

```powershell
.\.venv\Scripts\adk.exe web agents --port 8001 --no_use_local_storage
```

Abrir `http://127.0.0.1:8001`, selecionar `translog_agent` e perguntar por 1001. Conferir a chamada da ferramenta. Para finalizar o servidor, usar Ctrl+C no terminal. O comando não significa que a chave foi validada: isso só ocorre ao enviar uma pergunta ao modelo.

`--no_use_local_storage` mantém as conversas em memória nesta demonstração; reiniciar o processo apaga essas sessões. Essa escolha é independente do banco de pedidos que o grupo definirá.

## 7. Integrar com Matheus

Depois de encerrar o servidor anterior:

```powershell
.\.venv\Scripts\adk.exe api_server agents --port 8001 --no_use_local_storage
```

Em outro terminal:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'Qual o status do pedido 1001?'
```

Ver `api-chat.md`. O script cria uma conversa própria com UUID; perguntas subsequentes podem reutilizar `--user-id` e `--session-id` com `--reuse-session`. Matheus implementa o adaptador no backend do portal. Validar tudo na máquina principal da demo; cada máquina mantém sua própria chave local.

## 8. Conferir e registrar

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Esses testes não gastam cota de Gemini. Seguir também os dez cenários de `avaliacao.md` com o modelo real, fonte conferida e conteúdo revisado. Registrar o resultado observado, inclusive falhas; não marcar cenários automaticamente como aprovados.

## 9. Trabalhar com o grupo pelo Git

Após receber o repositório, manter uma cópia de segurança destes arquivos e integrar à estrutura acordada, sem criar remoto paralelo. Antes de alterar, conferir `git status` e atualizar a base do grupo. Usar uma branch para sua entrega e pedir revisão por pull request. Não sobrescrever trabalho de colega nem usar `git push --force`.

No fim do bloco: dizer o que funciona, o que fará depois e o bloqueio. Se alterar um campo ou endpoint, atualizar contrato e avisar quem consome. Exemplo: “Consulta de amostra pronta; vou testar a Silver; banco ainda em definição.”
