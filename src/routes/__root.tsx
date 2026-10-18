import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ConfirmationProvider } from "../components/shared/confirmation";
import { Button } from "../components/ui/button";
import themeCss from "../styles/theme.css?url";
import appCss from "../styles/app.css?url";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Himmah Hub — Take part. Grow together." },
        {
          name: "description",
          content:
            "A place for youth to connect, contribute and grow with their community.",
        },
      ],
      links: [
        { rel: "stylesheet", href: themeCss },
        { rel: "stylesheet", href: appCss },
      ],
    }),
    component: Root,
    notFoundComponent: () => (
      <div className="empty-state">
        <h1>That page isn’t here.</h1>
        <Button asChild>
          <Link to="/">Back to Himmah</Link>
        </Button>
      </div>
    ),
    errorComponent: ({ reset }) => (
      <div className="empty-state" role="alert">
        <h1>Something went wrong.</h1>
        <p>Your request could not be completed.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    ),
    shellComponent: ({ children }) => (
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body>
          {children}
          <Scripts />
        </body>
      </html>
    ),
  },
);
function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmationProvider>
        <Outlet />
      </ConfirmationProvider>
    </QueryClientProvider>
  );
}
