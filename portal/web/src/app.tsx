import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { useHealth, useOrderQuery } from "@/api/queries.ts";
import { useLogout, useSession } from "@/api/session.ts";
import { AppFooter } from "@/components/app-footer.tsx";
import { AppHeader } from "@/components/app-header.tsx";
import {
  CheckingSessionPage,
  NotFoundPage,
  PrimaryLink,
  SimplePage,
} from "@/components/simple-page.tsx";
import { ChatPanel } from "@/features/chat/chat-panel.tsx";
import { useChatConversation } from "@/features/chat/use-chat-conversation.ts";
import { TrackingPage } from "@/features/tracking/tracking-page.tsx";
import {
  activeTab,
  guardRedirect,
  isStaffRoute,
  matchRoute,
  pageTitle,
  type Route,
  type SessionState,
  STAFF_LOGIN_PATH,
  trackingHref,
} from "@/lib/router.ts";
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

  const healthQuery = useHealth();
  const isConnected = !healthQuery.isError;

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

  const staffEmail = sessionQuery.data?.authenticated ? sessionQuery.data.email : null;
  const showStaffUser = isStaffRoute(route) && session === "authenticated";

  return (
    <div className="min-h-full min-w-[1280px] flex flex-col bg-slate-100/80 text-slate-900 antialiased">
      <AppHeader
        tab={activeTab(route)}
        connected={isConnected}
        staff={
          showStaffUser
            ? {
                email: staffEmail ?? "Colaborador",
                onLogout: handleLogout,
                loggingOut: logout.isPending,
              }
            : null
        }
      />

      <main className="flex-1">
        {redirect !== null || (isStaffRoute(route) && session === "loading") ? (
          <CheckingSessionPage />
        ) : (
          <Page
            route={route}
            tracking={
              route.name === "tracking" ? (
                <TrackingPage
                  orderParam={route.orderParam}
                  orderQuery={orderQuery}
                  onAskAssistant={chat.sendMessage}
                  chat={
                    <ChatPanel
                      activeOrder={activeOrder}
                      connected={isConnected}
                      messages={chat.messages}
                      typing={chat.typing}
                      onSendMessage={chat.sendMessage}
                      onRetryMessage={chat.retryMessage}
                      onNewChat={chat.newConversation}
                    />
                  }
                />
              ) : null
            }
          />
        )}
      </main>

      <AppFooter />
    </div>
  );
}

/** Página de cada rota. Início e Área do colaborador ganham o conteúdo nas tarefas 2 e 4. */
function Page({ route, tracking }: { route: Route; tracking: ReactNode }) {
  switch (route.name) {
    case "home":
      return (
        <SimplePage label="TransLog · Início" title="Sua carga pelo mundo. Cada etapa visível.">
          <p>Acompanhe despacho, voo, alfândega e entrega do seu pedido.</p>
          <PrimaryLink href="/rastreio">Rastrear um pedido</PrimaryLink>
        </SimplePage>
      );
    case "tracking":
      return tracking;
    case "staffLogin":
      return (
        <SimplePage label="Área do colaborador" title="Acesso restrito à equipe TransLog.">
          <p>O formulário de entrada chega na próxima etapa.</p>
        </SimplePage>
      );
    case "staffTower":
      return <SimplePage label="Área do colaborador" title="Torre de controle" />;
    case "staffOrder":
      return <SimplePage label="Visão do colaborador" title={`Pedido #${route.orderParam}`} />;
    case "notFound":
      return <NotFoundPage />;
  }
}
