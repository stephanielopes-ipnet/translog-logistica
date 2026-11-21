# Teste conjunto com Matheus: portal e agente Silver v2

Atualizado em **17/11/2026**. Marco esclareceu que já testou a integração anterior com Matheus, mas **a Silver v2 e a FAQ atual ainda não foram testadas juntos no portal**. Este é o próximo aceite. Aproveitar ambiente e chave existentes.

## Como funciona e quem faz o quê

O navegador envia a pergunta ao backend do portal. O backend chama o agente ADK, que consulta os pedidos nos CSVs e recupera orientações da FAQ pelo Chroma. O Gemini redige a resposta, que volta ao chat.

```text
Portal → backend do portal → agente ADK → pedido / FAQ → resposta ao cliente
```

Fazer primeiro tudo **na máquina de Matheus**, por compartilhamento de tela se estiverem separados. Matheus configura e executa o portal; Marco confere fonte, ferramentas e respostas. `localhost` de Matheus não é a porta 8003 do computador de Marco.

## 1. Conferir código e dados

Para validar a montagem da FAQ na imagem e o cache de pedidos, usar a versão do [PR #34](https://github.com/stephanielopes-ipnet/translog-logistica/pull/34). Depois da integração, usar a `main` atualizada. Os PRs #30 e #32 já foram integrados.

Matheus deve preservar suas alterações locais. Se a cópia de integração já acompanha essa branch e está limpa, pode atualizá-la com `git pull --ff-only`. Se está em outra branch ou tem trabalho próprio, preparar uma cópia de integração preservando esse trabalho; não forçar troca nem substituir componentes do portal.

Obter privadamente os mesmos três CSVs da v2 com Mateus de Dados ou Marco:

- `consumo_pedidos.csv`;
- `consumo_itens_pedido.csv`;
- `consumo_eventos_logisticos.csv`.

Colocar em `agent/data/silver/v2-2026-11-17/` e usar cópias dos **mesmos arquivos** em `portal/dados/` para comparar tela e chat. CSVs completos, `.env`, índices e caches ficam fora do Git.

A fonte continua Databricks `consumo_*`; este teste usa a alternativa local exportada já acordada. Se o portal usar Databricks diretamente, comparar versão/exportação e os pedidos antes do aceite: o agente ainda lê CSV e pode divergir de uma tabela atualizada depois.

## 2. Conferir e executar o agente

Para testar a imagem do portal, rodar em **`portal/`** com o Docker ativo, a chave configurada em `agent/.env` e os CSVs em `portal/dados/`:

```powershell
pnpm agent:up
docker compose -f docker-compose.yml -f docker-compose.agente.yml exec agent python -m translog.cli search 'Como funciona a central de atendimento?'
```

O build precisa de rede para baixar os embeddings. Ele gera o índice aprovado, testa a recuperação sem rede e guarda o índice e o modelo na imagem. A busca deve retornar `retrieved` com `faq-central-horarios`. Esse comando não chama o Gemini. Para conectar o backend local à imagem, usar `AGENT_URL=http://127.0.0.1:8001` no passo 3.

### Alternativa com Python local

Na pasta **`agent/`**, preservar a chave existente em `.env` e conferir as opções abaixo, sem mostrar a chave na tela compartilhada:

```dotenv
GEMINI_MODEL=gemini-3.5-flash-lite
TRANSLOG_ORDER_BACKEND=csv_v2
TRANSLOG_DATA_ORIGIN=silver
TRANSLOG_CONSUMPTION_DIR=data/silver/v2-2026-11-17
TRANSLOG_KNOWLEDGE_DIR=.state/chroma
TRANSLOG_ALLOW_DEMO_KNOWLEDGE=false
```

Usando o ambiente Python já preparado, executar dentro de `agent/`:

```powershell
.\.venv\Scripts\python.exe -m translog.cli doctor
.\.venv\Scripts\python.exe -m translog.cli order 1001
.\.venv\Scripts\python.exe -m translog.cli index --input knowledge/approved
.\.venv\Scripts\python.exe -m translog.cli search 'Qual o horário da central de atendimento?'
```

Esperado: backend `csv_v2`, origem `silver`, chave configurada sem mostrar o valor. O 1001 está entregue no prazo, tem quatro linhas de itens e 14 unidades. A indexação deve informar **18 trechos**, revisão `321eb6586e641c21af3d`; a busca deve recuperar central **9h–18h, segunda a sexta**, versão `2-conciliada-2026-11-17`. Se diferir, conferir os arquivos aprovados antes de avançar.

Esses comandos não fazem chamada generativa ao Gemini. O primeiro uso do índice pode baixar embeddings. Variáveis já definidas no processo têm precedência sobre `.env`.

Conferir se há agente na porta antes de iniciar outro. Se estiver parada, em um terminal dedicado:

```powershell
.\.venv\Scripts\adk.exe web agents --host 127.0.0.1 --port 8003 --no_use_local_storage
```

Manter aberto e conferir `http://127.0.0.1:8003/list-apps`: deve listar `translog_agent`. Se houver instância antiga, reiniciar somente o processo identificado para carregar código/configuração atuais. Depois usar nova conversa.

## 3. Ligar o backend ao agente

Em **`portal/.env`**, ajustar estas opções e preservar as demais configurações privadas:

```dotenv
DATA_SOURCE=file
DATA_DIR=dados
AGENT=adk
AGENT_URL=http://127.0.0.1:8003
AGENT_APP_NAME=translog_agent
AGENT_TIMEOUT_MS=90000
```

`AGENT=mock` usa o simulado do portal e não comprova integração com Gemini/FAQ. A chave Gemini fica somente no agente.

Na pasta **`portal/`**, iniciar pelo fluxo de desenvolvimento já usado por Matheus:

```powershell
pnpm dev
```

Se já estiver rodando, Matheus reinicia os processos necessários para carregar a configuração. Conferir `http://127.0.0.1:3333/api/health`: esperado `status=ok`, `dataSource=file`, `orders=65752`, `agent=adk`. Health não consulta o agente; ainda falta testar o chat. Abrir o endereço do frontend informado no terminal, normalmente `http://localhost:5173`.

Quando a API também roda no Docker, a sobreposição `docker-compose.agente.yml` já configura `AGENT_URL=http://agent:8001` na rede interna do Compose.

O backend já cria sessões e chama `POST /run`; não criar `/chat` adicional no agente. O prefixo `[Pedido aberto no portal: CÓDIGO]` leva contexto da tela; o agente consulta a ferramenta e não repete o prefixo ao cliente.

## 4. Testar juntos no portal

Estas mensagens fazem chamadas reais ao Gemini com a cota configurada. Executar durante o teste combinado. Começar cada caso com **Nova conversa**, exceto a troca de pedido, que continua o primeiro caso.

| Caso | Ação | O que conferir |
| --- | --- | --- |
| Contexto | Abrir **7** na tela; perguntar **“Por que aparece atraso?”** e **“Preciso falar com alguém?”** | Usa o 7 sem pedir novamente o código. Despacho +1, entrega 0; não é atraso crítico de entrega. |
| Troca | Na mesma conversa, abrir **1001** e perguntar **“Quantos itens ele tem?”** | Usa 1001: quatro linhas, 14 unidades, entregue no prazo. Não reaproveita dados do 7/amostra antiga. |
| Pedido e FAQ | Abrir **76380**; perguntar **“Qual a situação e o que devo fazer?”**, depois **“Qual o horário da central?”** | Em trânsito, entrega +7; orienta central 9h–18h, segunda a sexta. Não alega transferência executada. |
| Localização | Abrir **16**; perguntar **“Onde está meu pedido?”** | Não pago (expirado), sem despacho/localização física. Brasília/DF é somente destino. |
| Sessão | Usar **Nova conversa**, limpar pedido aberto e perguntar **“Onde está meu pedido?”** | Pede apenas o código; não herda pedido de outra conversa. Se a tela ainda tiver pedido aberto, esse contexto continua válido. |

Comparar tela e chat, guardar resposta pública e conferir chamadas/retornos das ferramentas no ADK quando disponíveis. No caso misto, observar `consultar_pedido` e `buscar_faq_e_politicas`: resposta correta sozinha não comprova recuperação da FAQ. Não compartilhar raciocínio interno, credenciais ou dados pessoais.

Atendimento simples e acolhedor, sem rodapés de fonte/versão; proveniência nos eventos e disponível se perguntada. Preservar datas originais; não inventar GPS, chegada a partir de hoje ou ação executada.

## 5. Falhas e aceite

Após os casos normais, Matheus pode encerrar **a instância dedicada ao teste**, identificada no terminal, e enviar uma pergunta nova. Esperado: portal mostra falha clara, sem inventar resposta ou dizer que o pedido inexiste. Reiniciar a mesma instância e abrir nova conversa. Isso testa conexão indisponível; **não comprova contingência para 503 do Gemini**, ainda não implementada.

Se aparecer 503/alta demanda, registrar horário, caso e erro como indisponibilidade do provedor. O backend pode apresentar 502 para falha do agente; conferir o código do provedor no registro técnico sem expor dados privados. Após timeout, não disparar reenvios repetidos: a mensagem pode continuar em processamento.

Registrar em [aceite-portal-v2-2026-11-17.md](aceite-portal-v2-2026-11-17.md), usando a ficha de [casos-teste-e-apresentacao-agente.md](casos-teste-e-apresentacao-agente.md). Só marcar passou depois de observar. Separar relato de Marco, conferência técnica local e aceite na máquina de Matheus.

## Mensagem pronta para Marco encaminhar

> Matheus, já testamos a integração anterior, mas falta validar juntos a Silver v2 e a FAQ atual. A versão está no PR #32, branch feat/agente-silver-v2-rag. Podemos fazer por compartilhamento de tela na sua máquina: usar os mesmos três CSVs no portal e no agente, indexar os 18 trechos da FAQ e apontar o backend para o ADK com AGENT=adk. O guia agent/docs/guia-matheus-fullstack.md tem os comandos. Vamos conferir pedido 7, troca para 1001, atraso/central no 76380, localização do 16, nova conversa e falha de conexão. Eu confiro respostas e ferramentas com você. Não precisa criar outra chave.

Mensagem preparada; o assistente não a enviou.
