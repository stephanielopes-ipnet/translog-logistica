# Auditoria do GitHub

Repositório `stephanielopes-ipnet/translog-logistica` · branch `main` · posição de 23/11/2026.
Gerada com `python scripts/github_audit.py --since 2026-11-10`, complementada com os dados de PRs e issues.

## Resumo

| Critério | Resultado | Avaliação |
|---|---|---|
| Commits (sem merges) | 78 | — |
| Padrão `tipo(area): descrição` | 69 de 78 (88%) | ✅ |
| Pull requests | 8, todas integradas | ✅ |
| Revisão nas PRs | Nenhuma revisão formal; 3 de 6 integradas por outra pessoa (#30 e #32 por Matheus, #33 por Marco) | ⚠️ revisão cruzada informal |
| Issues com dono, prazo e marco | 29 de 29 | ✅ |
| Issues fechadas | 10 de 29 | ⚠️ o quadro ainda não reflete todo o andamento |
| Documentos obrigatórios | README, planejamento, arquitetura e riscos presentes | ✅ |
| Contribuição por perfil | Portal, agente, dados e PMO com commits; BI sem commits do próprio integrante | ⚠️ |
| Segredos no repositório | Só `.env.example` versionado | ✅ |

## Commits por pessoa e dia

| Pessoa | 11-13 | 11-14 | 11-15 | 11-16 | 11-17 | 11-18 | 11-19 | 11-21 | 11-22 | Total |
|---|---|---|---|---|---|---|---|---|---|---|
| matheusdeursen | · | 10 | 5 | 5 | 6 | 10 | 3 | · | · | **39** |
| mateusFmaciel | · | 3 | 9 | · | 3 | · | · | · | 8 | **23** |
| Marco-Leal96 | · | 3 | · | 1 | 5 | · | 1 | 1 | · | **11** |
| Stephanie Lopes | 4 | · | · | · | · | · | · | · | 1 | **5** |

## Commits fora do padrão (até 10)

- 2026-11-22 · mateusFmaciel: `docs(pipeline): Move documentação da arquitetura para pasta de pipeline`
- 2026-11-22 · mateusFmaciel: `docs(pipeline): Adiciona a documentação que pode ser anexada no drive para os gestores e executivos`
- 2026-11-22 · mateusFmaciel: `docs(dashboard): documenta e padroniza queries da Gold no dashboard_v2 (36.671 finalizados)`
- 2026-11-18 · matheusdeursen: `feat: implement search and display enhancements for staff orders`
- 2026-11-15 · mateusFmaciel: ` feat(dados): carrega de-para de tradução pt-BR via notebook`
- 2026-11-14 · mateusFmaciel: `chore(gitignore):  ignora agora arquivos locais temporários relacionado a engenharia de dados como /data/raw e ignora notebooks carregados via databrickcli`
- 2026-11-14 · matheusdeursen: `feat: adiciona regra para ignorar mockup antigo do portal`
- 2026-11-14 · matheusdeursen: `feat: definição de protótipos do frontend`
- 2026-11-13 · Stephanie Lopes: `Estrutura inicial do projeto`

## Documentos obrigatórios

- ✅ `README.md`
- ✅ `docs/planejamento.md`
- ✅ `docs/arquitetura.md`
- ✅ `docs/riscos.md`
- Dailies: registradas em [relatorio-agil.md](relatorio-agil.md) (D1 a D10) 

## Pull requests

| PR | Autor | Aberta | Integrada | Integrada por | Título |
|---|---|---|---|---|---|
| #30 | Marco-Leal96 | 14/11 | 17/11 | matheusdeursen | feat(agente): integra base ADK com amostra e testes |
| #31 | matheusdeursen | 17/11 | 17/11 | matheusdeursen | feat(portal): portal de rastreamento com dados consumo_*, chat e agente de IA em Docker |
| #32 | Marco-Leal96 | 17/11 | 18/11 | matheusdeursen | feat(agente): Silver v2, FAQ fechada e atendimento para apresentação |
| #33 | matheusdeursen | 18/11 | 18/11 | Marco-Leal96 | feat(portal): Início, LogBot lateral, tema escuro e Área do colaborador |
| #34 | Marco-Leal96 | 19/11 | 21/11 | Marco-Leal96 | fix(agente): indexa FAQ no Docker e agiliza consultas de pedidos |
| #35 | matheusdeursen | 19/11 | 19/11 | matheusdeursen | feat(portal): portal de rastreamento com Área do colaborador, busca, LogBot e Docker |
| #36 | stephanielopes-ipnet | 22/11 | 22/11 | stephanielopes-ipnet | docs(pm): relatório ágil, riscos, auditoria e dados para a entrega |
| #37 | mateusFmaciel | 23/11 | 23/11 | mateusFmaciel | feat(dados): pipeline Medallion completo (Bronze, Silver v4, Gold OBT), testes e documentação |

## Conteúdo por pasta

| Pasta | Dono | Conteúdo | Situação |
|---|---|---|---|
| `portal/` | Matheus | API, interface, contratos, Docker, README e docs técnicos | ✅ completo |
| `agent/` | Marco | Agente ADK, FAQ, testes, registro de decisões e execução | ✅ completo |
| `docs/` | Stephanie | Planejamento, arquitetura, riscos, relatório ágil, auditoria, dados | ✅ completo |
| `pipeline/` | Mateus | 14 notebooks, dicionário de dados e documentação técnica | ✅ completo |
| `dashboard/` | Marcelo | Consultas da Gold documentadas (subidas pelo Mateus) | ⚠️ export do dashboard pelo Marcelo pendente |

## Ações até a banca

1. ~~Mateus: subir os notebooks~~ feito em 22/11 (PR #37).
2. **Marcelo:** exportar o dashboard (`.lvdash.json`) e as consultas para `dashboard/`, no padrão `feat(bi): ...`.
3. **Todos:** fechar as issues concluídas com um comentário de evidência (PR, print ou link).
4. **Stephanie:** rodar esta auditoria de novo depois dos commits e atualizar este arquivo.
