import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from "react";

// Ponte entre a History API e o React: a URL é a fonte da verdade da rota.
// `navigate` troca a URL sem recarregar e avisa quem usa `useLocation`.

const NAVIGATE_EVENT = "translog:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Caminho + query string atuais (ex.: `/rastreio?pedido=76902`). */
export function useLocationHref(): string {
  return useSyncExternalStore(subscribe, currentHref, () => "/");
}

/** Vai para outro endereço da tela. `replace` não cria entrada no histórico (Voltar). */
export function navigate(href: string, options: { replace?: boolean } = {}): void {
  if (href === currentHref()) {
    return;
  }
  if (options.replace) {
    window.history.replaceState(null, "", href);
  } else {
    window.history.pushState(null, "", href);
    window.scrollTo(0, 0);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * Link interno: navega sem recarregar a página. Ctrl/Cmd/Shift/clique do meio continuam abrindo
 * em outra aba, como um link comum.
 */
export function Link({ href, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handleClick} {...rest} />;
}
