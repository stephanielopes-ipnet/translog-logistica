# Registro de execução

## Preparação — 12/11/2026

- Plano e contexto lidos; diretório inicialmente vazio, sem Git.
- Decisão de execução: trabalhar na pasta atual e não criar remoto/worktree, preservando o repositório que Stephanie criará.
- Regra: banco definitivo permanece pendente; CSV/amostra não será apresentado como SQL.
- Python disponível: 3.12.14 do runtime local. Ambiente virtual próprio do projeto.
- Diagnóstico: ensurepip não conseguiu escrever no TEMP padrão do sandbox. TEMP/TMP de instalação foram direcionados para `.cache/tmp` dentro do projeto.
- Rede: download inicial do pip falhou por DNS no sandbox; repetida instalação com acesso de rede aprovado para dependências locais.

## Verificação

Não tratar existência de código ou mocks como aprovação da avaliação de conversas.

- Testes iniciais falharam por módulos ausentes; depois da implementação, 22 passaram para consulta CSV, validação, índice Chroma real com embeddings de teste e adaptação do cliente.
- Dependência nativa Chroma exigiu MSVCP140 no Windows. Instalar `msvc-runtime` na `.venv` e registrar seus diretórios no processo resolveu a importação; nenhuma alteração global no Windows.
- API: dois testes passaram com rotas ADK reais, ferramenta real e modelo determinístico de teste. Sem chamada Gemini. Restrição de socketpair do sandbox foi diagnosticada; repetição autorizada fora dessa restrição passou. Os processos presos foram interrompidos.
- Embeddings reais: modelo local baixado em `.cache/models`. Índice demo com oito documentos criado. Três perguntas em português recuperaram o item esperado no top 3 (rastreio, alteração de endereço e atraso).
- Smoke HTTP: servidor nativo iniciado em loopback, `/list-apps` encontrou `translog_agent`, sessão criada; servidor encerrado ao final.

## Revisão independente

Uma revisão somente leitura identificou três pontos importantes, todos corrigidos com regressões observadas em RED e GREEN:

1. Retirar a última política precisava revogar o conhecimento ativo: corpus válido vazio publica índice vazio; caminho inválido preserva a última revisão.
2. O cliente precisava rejeitar texto intermediário, parcial ou interrompido em vez de apresentá-lo como resposta final.
3. Encoding CSV inválido precisava retornar indisponibilidade, sem exceção escapando do contrato da ferramenta.

Também validado o tipo de metadado `approved_by`, evitando erro interno ao preencher o modelo JSON incorretamente.

Itens fora do julgamento da revisão permanecem limites/pendências documentados: banco e Silver reais, conteúdo revisado, qualidade Gemini, integração ao portal/pipeline/BI, hospedagem/autenticação pública e diff Git (pasta sem repositório). Não há liberação implícita para produção.

## Decisões de execução

- Trabalho local sem criar Git remoto/worktree: repositório único da Stephanie ainda não está disponível. Custo se alterado: integrar estes arquivos à estrutura do grupo preservando trabalho existente.
- CSV mantém desenvolvimento andando, com estado explícito; conector definitivo aguarda o grupo. Custo futuro: implementar e verificar o adaptador do banco selecionado.
- Sessões ADK em memória evitam atribuir um banco de pedidos por acidente; reinício perde essas conversas de demonstração. Se persistência for necessária, o grupo deverá defini-la.
- MSVC e caches ficaram no projeto/venv; outra máquina recria ambiente e baixa o modelo uma vez.

Avisos de depreciação observados são da rota de sessão ADK e da função de embedding determinística de teste. A rota foi verificada na versão fixada; atualizar versões exige repetir os testes. Não houve achado menor adiado pelo revisor.

## Resultado final

`python -m pytest -q --junitxml=.state/test-results.xml` -> **30 passed**, 9 avisos, zero falhas. Relatório local em `.state/test-results.xml`. `compileall`, `pip check`, parser PowerShell e execução do script de preparação também passaram. Código não foi alterado após essa suíte; apenas estes registros de resultado foram atualizados.
