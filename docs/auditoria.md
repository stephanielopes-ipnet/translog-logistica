# Auditoria do GitHub

Repositório `stephanielopes-ipnet/translog-logistica` · branch `main` · posição de 22/11/2026.
Gerada com `python scripts/github_audit.py --since 2026-11-10`, complementada com os dados de PRs e issues.

## Resumo

| Critério | Resultado | Avaliação |
|---|---|---|
| Commits (sem merges) | 54 | — |
| Padrão `tipo(area): descrição` | 50 de 54 (93%) | ✅ |
| Pull requests | 6, todas integradas | ✅ |
| Revisão nas PRs | Nenhuma revisão formal; 3 de 6 integradas por outra pessoa (#30 e #32 por Matheus, #33 por Marco) | ⚠️ revisão cruzada informal |
| Issues com dono, prazo e marco | 29 de 29 | ✅ |
| Issues fechadas | 1 de 29 | ⚠️ o quadro não reflete o andamento |
| Documentos obrigatórios | README, planejamento, arquitetura e riscos presentes | ✅ |
| Contribuição por perfil | Portal, agente e PMO com commits; pipeline e dashboard sem commits | ❌ |
| Segredos no repositório | Só `.env.example` versionado | ✅ |

## Commits por pessoa e dia

| Pessoa | 11-13 | 11-14 | 11-15 | 11-16 | 11-17 | 11-18 | 11-19 | 11-21 | Total |
|---|---|---|---|---|---|---|---|---|---|
| matheusdeursen | · | 10 | 5 | 5 | 6 | 10 | 3 | · | **39** |
| Marco-Leal96 | · | 3 | · | 1 | 5 | · | 1 | 1 | **11** |
| Stephanie Lopes | 4 | · | · | · | · | · | · | · | **4** |

## Commits fora do padrão (até 10)

- 2026-11-18 · matheusdeursen: `feat: implement search and display enhancements for staff orders`
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

## Conteúdo por pasta

| Pasta | Dono | Conteúdo | Situação |
|---|---|---|---|
| `portal/` | Matheus | API, interface, contratos, Docker, README e docs técnicos | ✅ completo |
| `agent/` | Marco | Agente ADK, FAQ, testes, registro de decisões e execução | ✅ completo |
| `docs/` | Stephanie | Planejamento, arquitetura, riscos, relatório ágil, auditoria, dados | ✅ completo |
| `pipeline/` | Mateus | Só README | ❌ notebooks Bronze, Silver e Gold fora do Git |
| `dashboard/` | Marcelo | Só README | ❌ export do dashboard e consultas fora do Git |

## Ações até a banca

1. **Mateus:** subir os notebooks como arquivo fonte (`Download as → Source file`) em `pipeline/`, no padrão `feat(dados): ...`.
2. **Marcelo:** exportar o dashboard (`.lvdash.json`) e as consultas para `dashboard/`, no padrão `feat(bi): ...`.
3. **Todos:** fechar as issues concluídas com um comentário de evidência (PR, print ou link).
4. **Stephanie:** rodar esta auditoria de novo depois dos commits e atualizar este arquivo.
