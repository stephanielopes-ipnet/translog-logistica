# Acesso ao Gemini na máquina de Matheus FullStack

**Atualização posterior de 14/11:** Marco decidiu usar a chave já criada também na execução do colega, por compartilhamento privado seguro. O guia atual para encaminhamento é [guia-matheus-fullstack.md](guia-matheus-fullstack.md), já publicado em `agent/docs/` no PR #30, commit `122cea8`. As alternativas de criar outra chave descritas abaixo não são uma exigência para Matheus. Este arquivo é o registro inicial da explicação.

Preparado em 14/11/2026. Guia de configuração local; ainda não executado na máquina de Matheus. Este arquivo está na documentação da pasta original e ainda não foi incluído no PR #30.

## O que será criado

Matheus não precisa criar uma nova API nem reconstruir o agente no AI Studio. A API Gemini já existe e o código TransLog já sabe usá-la. É necessário fornecer à execução do agente uma **chave de acesso à API Gemini**.

Não existe uma obrigação de gerar uma chave nova para cada computador. Uma chave existente e autorizada pode servir. Para Matheus desenvolver sem receber a chave pessoal de Marco, ele pode criar uma chave para os próprios testes em um projeto que tenha autorização para usar, ou usar uma credencial de equipe disponibilizada por um canal seguro e sob os acordos do grupo.

Neste primeiro teste, portal, backend e agente podem rodar na máquina de Matheus. A chave fica na configuração do **agente**, não no frontend do portal. Se futuramente o agente rodar em um servidor separado, é nesse servidor que a credencial será configurada; quem só chama a API de chat não precisa receber a chave Gemini.

## 1. Obter uma chave autorizada

1. Abrir a [página de chaves do Google AI Studio](https://aistudio.google.com/apikey).
2. Entrar com uma conta Google autorizada para o teste.
3. Se já possuir uma chave Gemini válida e autorizada, utilizá-la. Caso contrário, usar **Create API key / Criar chave de API**.
4. Seguir o diálogo para selecionar um projeto autorizado ou criar um projeto quando essa opção estiver disponível. A chave fica associada ao projeto; não é necessário criar um novo projeto só por estar em outra máquina.
5. Copiar o valor diretamente para o arquivo local descrito a seguir, sem enviar ao grupo, ao chat ou ao repositório.

Se a organização impedir a criação de projeto/chave, alinhar o acesso com o responsável e o grupo. Uma conta pessoal não é requisito da aplicação. Criar uma chave também não confirma cota, acesso ao modelo ou necessidade de contratação: se o fluxo exigir faturamento para continuar, alinhar essa decisão antes de ativá-lo.

Fonte do procedimento: [documentação oficial de chaves Gemini](https://aistudio.google.com/docs/api-key), consultada em 14/11/2026. A interface e as permissões disponíveis podem variar conforme a conta.

## 2. Usar a branch que contém o código

O código está na branch `feat/agente-integracao`, na pasta [agent](https://github.com/stephanielopes-ipnet/translog-logistica/tree/feat/agente-integracao/agent). O [PR #30](https://github.com/stephanielopes-ipnet/translog-logistica/pull/30) foi criado como rascunho; a base ainda não foi incorporada à `main` neste acompanhamento.

Matheus deve trabalhar na cópia dessa branch, preservando eventuais alterações do portal. Os comandos seguintes partem da pasta `agent` dessa cópia, não da raiz do repositório nem de `portal`.

## 3. Preparar o ambiente e o arquivo privado

No Windows, com Python 3.12 disponível pelo comando `py`, o README prevê:

```powershell
.\scripts\setup.ps1
```

O script cria o ambiente `.venv`, instala as dependências e cria `.env` a partir de `.env.example` **apenas se `.env` ainda não existir**. Também cria `.cache/tmp`. Caso a política corporativa bloqueie o script, comunicar o erro e seguir os comandos manuais de instalação acordados, sem alterar políticas globais por conta própria.

Se o ambiente já estiver instalado e faltar apenas `.env`, copiar somente o modelo, preservando configuração existente:

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Abrir `agent/.env` no editor local e preencher/ajustar estas duas linhas:

```dotenv
GOOGLE_API_KEY=COLE_A_CHAVE_REAL_SOMENTE_NO_ARQUIVO_LOCAL
GEMINI_MODEL=gemini-3.5-flash-lite
```

O texto `COLE_A_CHAVE_REAL_SOMENTE_NO_ARQUIVO_LOCAL` é um marcador explicativo: deve ser substituído pela chave no editor. Não é uma credencial funcional. Não imprimir o arquivo preenchido em terminal, chat ou captura de tela.

O modelo indicado é o que Marco conseguiu utilizar; acesso e cota precisam ser verificados na conta de Matheus. A `.env.example` publicada ainda traz `gemini-3.8-flash`, que teve indisponibilidade nas tentativas de Marco. Por isso o guia pede ajustar explicitamente o modelo local, sem alterar silenciosamente o modelo para todo o grupo.

Preservar, para o primeiro teste, a consulta fictícia:

```dotenv
TRANSLOG_ORDER_BACKEND=csv
TRANSLOG_ORDERS_CSV=data/samples/orders.csv
TRANSLOG_DATA_ORIGIN=sample
TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false
```

Esses valores não conectam a Silver nem habilitam políticas fictícias. A configuração é carregada por `Settings.from_env()` usando `python-dotenv`; `GOOGLE_API_KEY` é disponibilizada à biblioteca que acessa o Gemini. Variáveis já existentes no processo têm precedência, pois a aplicação usa `override=False`. Se a configuração parecer não mudar, verificar localmente variáveis herdadas sem exibir seu conteúdo.

## 4. Conferir sem expor a chave

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli order 1001
```

Esperado no diagnóstico: `api_key_configured=true`, modelo configurado, backend CSV e origem `sample`. Esse diagnóstico **apenas confirma que a chave está preenchida; não valida a credencial no Google nem testa cota**. Sem índice aprovado, o diagnóstico pode informar ausência de conhecimento indexado, o que é esperado nesta fase.

A consulta direta deve encontrar 1001 com 4 dias previstos, 6 registrados e 2 de atraso. Ela lê a amostra sem chamar Gemini; portanto, seu sucesso também não prova acesso ao modelo.

## 5. Testar a API do agente com o modelo

Em um terminal, ainda dentro de `agent`, iniciar:

```powershell
.\.venv\Scripts\adk.exe api_server agents --port 8001 --no_use_local_storage
```

Manter o terminal aberto. Se já houver `adk web` ou outro servidor usando a porta 8001 na máquina, identificar esse processo e combinar a troca de modo; não iniciar dois servidores na mesma porta.

Em outro terminal, também dentro de `agent`, executar o exemplo:

```powershell
.\.venv\Scripts\python.exe scripts/chat_demo.py 'Qual o status do pedido 1001?'
```

O exemplo cria uma conversa e envia a pergunta à API local. Essa etapa chama o Gemini e é a primeira confirmação conjunta de chave, modelo e fluxo de consulta. Resultado esperado: resposta baseada na amostra, identificada como fictícia/histórica. Uma falha de permissão, modelo ou cota deve ser investigada pelo erro; não tratar a existência do servidor como credencial validada.

Essa chamada de exemplo ainda não é o portal integrado. A documentação inicial do contrato está em `docs/api-chat.md` da pasta original de Marco e será levada ao repositório do grupo. O retorno nativo é uma lista de eventos ADK; o backend precisa extrair a resposta final e separar usuários/conversas. O script `chat_demo.py` é uma referência já publicada.

## Significado de “privadamente”

- A chave fica na `.env` local do agente e é ignorada pelo Git.
- O grupo pode receber instruções e nomes de variáveis, sem receber o valor da chave.
- A chave Gemini não deve entrar no frontend nem ser enviada pelo navegador do cliente.
- O portal envia a pergunta ao backend; o backend chama a API do agente; o agente usa sua credencial para acessar o Gemini.

Este guia não criou chave, projeto ou faturamento, não executou inferência e não alterou a configuração de Marco. O teste na máquina de Matheus continua pendente.
