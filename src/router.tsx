import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { PageSkeleton } from "./components/shared/page-skeleton";
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPendingComponent: PageSkeleton,
    scrollRestoration: true,
  });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
