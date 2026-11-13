#!/usr/bin/env python3
"""Auditoria do repositório para o Relatório Ágil.

Gera uma tabela Markdown com:
  - commits por pessoa e por dia
  - % de commits seguindo o padrão Conventional Commits
  - checagem dos documentos obrigatórios

Uso (na raiz do repositório):
    python scripts/github_audit.py                 # histórico completo
    python scripts/github_audit.py --since 2026-11-10
    python scripts/github_audit.py > docs/auditoria.md
"""
import argparse
import re
import subprocess
from collections import defaultdict
from pathlib import Path

PADRAO = re.compile(r"^(feat|fix|docs|refactor|test|chore)\((dados|agente|portal|bi|pm)\): .+")
DOCS_OBRIGATORIOS = [
    "README.md",
    "docs/planejamento.md",
    "docs/arquitetura.md",
    "docs/riscos.md",
]


def ler_commits(since):
    cmd = ["git", "log", "--no-merges", "--date=short", "--pretty=format:%an\x1f%ad\x1f%s"]
    if since:
        cmd.append(f"--since={since}")
    saida = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [linha.split("\x1f") for linha in saida.splitlines() if linha]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="data inicial AAAA-MM-DD")
    args = ap.parse_args()

    commits = ler_commits(args.since)
    por_pessoa_dia = defaultdict(lambda: defaultdict(int))
    fora_do_padrao = []
    dias = set()
    for autor, dia, msg in commits:
        por_pessoa_dia[autor][dia] += 1
        dias.add(dia)
        if not PADRAO.match(msg):
            fora_do_padrao.append((autor, dia, msg))

    dias = sorted(dias)
    print("# Auditoria do GitHub\n")
    print(f"Total de commits: **{len(commits)}**")
    if commits:
        ok = len(commits) - len(fora_do_padrao)
        print(f" · No padrão: **{ok}/{len(commits)} ({ok / len(commits):.0%})**\n")

    print("## Commits por pessoa e dia\n")
    print("| Pessoa | " + " | ".join(d[5:] for d in dias) + " | Total |")
    print("|---|" + "---|" * (len(dias) + 1))
    for autor in sorted(por_pessoa_dia, key=lambda a: -sum(por_pessoa_dia[a].values())):
        linha = [str(por_pessoa_dia[autor].get(d, 0) or "·") for d in dias]
        print(f"| {autor} | " + " | ".join(linha) + f" | **{sum(por_pessoa_dia[autor].values())}** |")

    if fora_do_padrao:
        print("\n## Commits fora do padrão (até 10)\n")
        for autor, dia, msg in fora_do_padrao[:10]:
            print(f"- {dia} · {autor}: `{msg}`")

    print("\n## Documentos obrigatórios\n")
    for doc in DOCS_OBRIGATORIOS:
        print(f"- {'✅' if Path(doc).exists() else '❌'} `{doc}`")
    dailies = sorted(p.name for p in Path("docs/dailies").glob("D*.md"))
    print(f"- Dailies registradas: **{len(dailies)}** {', '.join(dailies)}")


if __name__ == "__main__":
    main()
