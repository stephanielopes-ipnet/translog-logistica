import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useOrderQuery } from "@/api/queries.ts";
import { useLogout, useSession } from "@/api/session.ts";
import { AppFooter } from "@/components/app-footer.tsx";
import { AppHeader } from "@/components/app-header.tsx";
import { CheckingSessionPage, NotFoundPage } from "@/components/simple-page.tsx";
import { ChatPanel } from "@/features/chat/chat-panel.tsx";
import { LOGBOT_INPUT_ID, LogBotDock } from "@/features/chat/logbot-dock.tsx";
import { askLogBot, browserStorage, createLogBotPanelStore } from "@/features/chat/logbot-panel.ts";
import { useChatConversation } from "@/features/chat/use-chat-conversation.ts";
import { HomePage } from "@/features/home/home-page.tsx";
import { StaffLoginPage } from "@/features/staff/staff-login-page.tsx";
import { StaffOrderPage } from "@/features/staff/staff-order-page.tsx";
import { TowerPage } from "@/features/staff/tower-page.tsx";
import { TrackingPage } from "@/features/tracking/tracking-page.tsx";
import {
  guardRedirect,
  headerKind,
  isStaffRoute,
  matchRoute,
  pageTitle,
  type SessionState,
  STAFF_LOGIN_PATH,
  staffAccessHref,
  trackingHref,
} from "@/lib/router.ts";
import { createBrowserThemeStore, nextTheme } from "@/lib/theme.ts";
import { parseOrderId } from "@/lib/url-state.ts";
import { navigate, useLocationHref } from "@/lib/use-location.tsx";

export function App() {
  const href = useLocationHref();
  const route = useMemo(() => {
    const url = new URL(href, "http://local");
    return matchRoute(url.pathname, url.search);
  }, [href]);

  // Endereço antigo (`/?pedido=N`): abre o rastreio e passa a mostrar `/rastreio?pedido=N`.
  useEffect(() => {
    if (route.name === "tracking" && !href.startsWith("/rastreio")) {
      navigate(trackingHref(route.orderParam), { replace: true });
    }
  }, [href, route]);

  useEffect(() => {
    document.title = pageTitle(route);
  }, [route]);

  // Sessão do colaborador: guarda da Área do colaborador e e-mail no cabeçalho.
  const sessionQuery = useSession();
  const session: SessionState = sessionQuery.isPending
    ? "loading"
    : sessionQuery.data?.authenticated
      ? "authenticated"
      : "anonymous";
  const redirect = guardRedirect(route, href, session);
  useEffect(() => {
    if (redirect !== null) {
      navigate(redirect, { replace: true });
    }
  }, [redirect]);

  const logout = useLogout();
  const handleLogout = useCallback(() => {
    logout.mutate(undefined, { onSettled: () => navigate(STAFF_LOGIN_PATH) });
  }, [logout]);

  // Pedido do rastreio do cliente: fica aqui para o chat saber de qual pedido se fala.
  const trackingOrderId = route.name === "tracking" ? parseOrderId(route.orderParam) : null;
  const orderQuery = useOrderQuery(trackingOrderId);
  const activeOrder = trackingOrderId !== null ? (orderQuery.data ?? null) : null;

  // O LogBot citou outro pedido: abre o rastreio dele (a mesma conversa continua lá).
  const routeName = route.name;
  const handleMentionedOrder = useCallback(
    (orderId: number) => {
      navigate(trackingHref(orderId), { replace: routeName === "tracking" });
    },
    [routeName],
  );

  const chat = useChatConversation({
    activeOrder,
    focusedOrderId: trackingOrderId,
    onMentionedOrder: handleMentionedOrder,
  });

  // Tema claro/escuro (classe `dark` no <html>; escolha salva no navegador).
  const [themeStore] = useState(createBrowserThemeStore);
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "light" as const);
  const toggleTheme = useCallback(() => themeStore.set(nextTheme(themeStore.get())), [themeStore]);

  // Painel do LogBot (aberto ou minimizado), o mesmo no Início e no Rastreamento.
  const [panel] = useState(() => createLogBotPanelStore(browserStorage()));
  const panelOpen = useSyncExternalStore(panel.subscribe, panel.isOpen, () => true);
  const { sendMessage } = chat;
  const ask = useCallback(
    (text: string) => askLogBot(panel, sendMessage, text),
    [panel, sendMessage],
  );
  const openLogBot = useCallback(() => {
    panel.setOpen(true);
    requestAnimationFrame(() => document.getElementById(LOGBOT_INPUT_ID)?.focus());
  }, [panel]);

  const staffEmail = sessionQuery.data?.authenticated ? sessionQuery.data.email : null;
  const accessHref = staffAccessHref(session);
  const kind = headerKind(route);

  /** Páginas do cliente: conteúdo à esquerda e o painel do LogBot à direita. */
  const customerLayout = (content: ReactNode, background = "") => (
    <div className={background}>
      <div className="mx-auto max-w-[1440px] px-6 flex">
        <div className="flex-1 min-w-0">{content}</div>
        <LogBotDock open={panelOpen} onOpen={() => panel.setOpen(true)}>
          <ChatPanel
            activeOrder={activeOrder}
            messages={chat.messages}
            typing={chat.typing}
            onSendMessage={ask}
            onRetryMessage={chat.retryMessage}
            onNewChat={chat.newConversation}
            onMinimize={() => panel.setOpen(false)}
          />
        </LogBotDock>
      </div>
    </div>
  );

  let page: ReactNode;
  if (redirect !== null || (isStaffRoute(route) && session === "loading")) {
    page = <CheckingSessionPage />;
  } else {
    switch (route.name) {
      case "home":
        page = customerLayout(
          <HomePage onOpenLogBot={openLogBot} staffAccessHref={accessHref} />,
          "hero-grid",
        );
        break;
      case "tracking":
        page = customerLayout(
          <TrackingPage
            orderParam={route.orderParam}
            orderQuery={orderQuery}
            onAskAssistant={ask}
          />,
        );
        break;
      case "staffLogin":
        page = <StaffLoginPage expired={route.expired} />;
        break;
      case "staffTower":
        page = <TowerPage />;
        break;
      case "staffOrder":
        page = <StaffOrderPage orderParam={route.orderParam} />;
        break;
      case "notFound":
        page = <NotFoundPage />;
        break;
    }
  }

  return (
    <div className="min-h-full flex flex-col overflow-x-clip bg-page text-slate-900 antialiased">
      {kind === "staff" ? (
        <AppHeader
          theme={theme}
          onToggleTheme={toggleTheme}
          kind="staff"
          towerPage={route.name === "staffTower"}
          email={staffEmail ?? "Colaborador"}
          onLogout={handleLogout}
          loggingOut={logout.isPending}
        />
      ) : (
        <AppHeader
          theme={theme}
          onToggleTheme={toggleTheme}
          kind="public"
          trackingActive={route.name === "tracking"}
          staffAccessHref={accessHref}
        />
      )}

      <main className="flex-1">{page}</main>

      <AppFooter staffAccessHref={kind === "public" ? accessHref : null} />
    </div>
  );
}
