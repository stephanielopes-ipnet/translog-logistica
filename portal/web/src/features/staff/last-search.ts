// Última busca de pedidos aberta nesta aba (só em memória: some ao recarregar). A visão do
// colaborador usa para mostrar "Voltar à busca" quando o usuário veio da lista.

let lastSearchHref: string | null = null;

export function rememberSearch(href: string): void {
  lastSearchHref = href;
}

export function lastSearch(): string | null {
  return lastSearchHref;
}

/** Só para os testes. */
export function forgetSearch(): void {
  lastSearchHref = null;
}
