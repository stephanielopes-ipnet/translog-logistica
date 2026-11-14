# Primeiro teste do agente com o portal

Guia para Matheus FullStack, preparado em 14/11/2026. Objetivo: executar o agente localmente, validar uma pergunta pela API e depois ligar o backend do portal a ela. A integração na máquina do colega ainda precisa ser executada.

## 1. Obter o código da branch correta

Os arquivos estão na branch **`feat/agente-integracao`**, pasta [agent](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/agente-integracao/agent), no [PR #30](https://github.com/stephanielopes-ipnet/translog-logistica/pull/30). O PR é rascunho; não procurar essa implementação na `main` antes do merge.

Se ainda não tiver uma cópia dessa branch, pode baixar em uma pasta separada, preservando o trabalho existente do portal:

```powershell
git clone --branch feat/agente-integracao https://github.com/stephanielopes-ipnet/translog-logistica.git translog-logistica-integracao
cd .\translog-logistica-integracao\agent
```

Se já tiver uma cópia atualizada dessa branch, basta abrir a pasta `agent` dela. Todos os comandos seguintes partem de **`agent`**, não da raiz do repositório nem de `portal`.

## 2. Preparar o ambiente Python

No Windows, com Python 3.12 instalado e disponível pelo launcher `py`:

```powershell
py -3.12 --version
.\scripts\setup.ps1
```

O script instala as dependências na `.venv`, cria `.cache/tmp` e copia `.env.example` para `.env` apenas se esse arquivo ainda não existir. O diagnóstico ao final pode informar chave ainda ausente — preencher no passo seguinte. Não é necessário ativar a `.venv` para usar os comandos deste guia.

Se a política do ambiente bloquear o script, usar os comandos manuais de preparação, sem alterar políticas globais:

```powershell
New-Item -ItemType Directory -Path .\.cache -Force | Out-Null
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock -e '.[dev]'
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Se um comando falhar, conferir o erro antes de executar o próximo.

## 3. Configurar a chave já criada para os testes

**Marco optou por disponibilizar a mesma chave Gemini já criada para os testes do projeto. Matheus não precisa criar outra chave ou outro projeto no AI Studio para este fluxo.** O compartilhamento será feito por um meio privado seguro entre os dois; o valor não está neste guia ou no GitHub e não foi lido/copiado pelo assistente.

Após receber a chave, abrir **`agent/.env`** no editor local e ajustar:

```dotenv
GOOGLE_API_KEY=SUBSTITUA_PELA_CHAVE_RECEBIDA_PRIVADAMENTE
GEMINI_MODEL=gemini-3.5-flash-lite
TRANSLOG_ORDER_BACKEND=csv
TRANSLOG_ORDERS_CSV=data/samples/orders.csv
TRANSLOG_DATA_ORIGIN=sample
TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false
```

O texto após `GOOGLE_API_KEY=` é um marcador: substituir pelo valor real somente no arquivo local. Preservar as demais configurações do modelo de arquivo. A `.env.example` ainda traz o modelo inicialmente proposto `gemini-3.8-flash`; ajustar a `.env` como acima para repetir o modelo que funcionou com Marco. Acesso ao modelo e cota continuam sujeitos ao projeto Google usado pela chave.

A chave fica no processo do agente e não deve ser enviada ao navegador, ao grupo ou ao GitHub. Usar a mesma chave compartilha a cota do mesmo projeto. Se houver uma variável `GOOGLE_API_KEY` ou `GEMINI_MODEL` já configurada no ambiente do processo, ela tem precedência sobre `.env`; conferir isso localmente sem imprimir o segredo se a configuração não corresponder ao esperado.

## 4. Conferir a preparação

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli order 1001
```

Esperado: diagnóstico com `api_key_configured=true`, modelo configurado, backend `csv` e origem `sample`; consulta com 4 dias previstos, 6 registrados e 2 de atraso. O diagnóstico não mostra a chave. Ausência de índice revisado é esperada neste momento.

Esses comandos não chamam Gemini: confirmam configuração preenchida e consulta à amostra, não validade da credencial nem cota. Se desejar conferir a suíte sem consumir Gemini:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

A suíte teve 30 testes aprovados na integração local apresentada por Marco. A preparação independente desta máquina ainda precisa ser conferida.

## 5. Iniciar a API

Em um terminal dentro de `agent`:

```powershell
.\.venv\Scripts\adk.exe api_server agents --host 127.0.0.1 --port 8001 --no_use_local_storage
```

Manter esse terminal aberto. Se já houver um servidor usando a porta 8001, conferir qual é antes de iniciar outro. Para trocar de `adk web` para `api_server` nessa porta, encerrar o servidor anterior de forma combinada. Não há necessidade de parar o ADK do computador de Marco para executar um servidor no computador de Matheus.

Na máquina que está executando a API, abrir [documentação interativa local](http://127.0.0.1:8001/docs). Ela ajuda a conferir as rotas; o sucesso ao abrir a página ainda não testa o Gemini.

## 6. Fazer uma pergunta antes de integrar o portal

Em outro terminal, também dentro de `agent`:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'Qual o status do pedido 1001?'
```

Esse comando chama o Gemini usando a chave configurada, cria uma conversa própria e imprime os IDs e a resposta final. Esperado: pedido 1001 encontrado na amostra, com 4 dias previstos, 6 registrados e 2 de atraso, identificado como fictício/histórico. A resposta pode variar na redação.

Só avançar à ligação com o portal depois que esse teste funcionar. Se falhar, conferir servidor, credencial, acesso ao modelo, cota e logs locais, sem compartilhar o segredo.

## 7. Ligar o backend do portal ao agente

Fluxo previsto:

```text
Navegador -> backend do portal -> API ADK -> ferramenta de pedido/Gemini
Navegador <- backend do portal <- resposta final do agente
```

O backend deverá:

1. Criar uma sessão para cada nova conversa do usuário, sem compartilhar contexto entre clientes.
2. Enviar a mensagem para `POST http://127.0.0.1:8001/run`, com os IDs da sessão.
3. Extrair a resposta final da lista de eventos retornada pelo ADK.
4. Devolver esse texto ao frontend e tratar falhas claramente.

Os corpos HTTP completos e a referência para extração estão em [api-chat.md](api-chat.md). O exemplo completo já está em `scripts/chat_demo.py` e a função de extração em `src/translog/client.py`.

O endereço `127.0.0.1` funciona para processos na mesma máquina. Para este primeiro teste, executar backend e agente juntos na máquina de Matheus; uma implantação em outra máquina, contêiner ou servidor exigirá ajustar o endereço e o acesso. Não foi preparado um endpoint público neste escopo.

O backend pode manter a rota própria que já utiliza, após alinharmos seu contrato; a API nativa do agente usa `/run`, não um `/chat` implementado nesta base. Nenhuma alteração no código do portal foi feita por esta documentação.

## 8. Conferência conjunta

Primeiro objetivo: digitar no portal “Qual o status do pedido 1001?” e receber a resposta fundamentada na amostra fictícia.

Depois conferir 1004 com os dois itens, 9999 não encontrado e uma nova conversa sem código solicitando identificação. Confirmar também que duas conversas não compartilham histórico e que indisponibilidade não vira resposta inventada.

O aceite dessa etapa será a comunicação funcionando entre portal, backend e agente na máquina do colega, com evidência registrada. Uso da Silver, definição do banco e conteúdo oficial de FAQ/políticas permanecem alinhamentos separados; não são declarados concluídos por esse teste.
