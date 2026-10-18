import { LocaleProvider, useLocale } from "../localization/locale";
import { getLocale, getTextDirection } from "../paraglide/runtime.js";
import { m } from "@/paraglide/messages.js";
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
        { title: m.page_title() },
        {
          name: "description",
          content: m.page_description(),
        },
      ],
      links: [
        { rel: "stylesheet", href: themeCss },
        { rel: "stylesheet", href: appCss },
      ],
    }),
    component: Root,
    notFoundComponent: () => {
      useLocale();
      return (
        <div className="empty-state">
          <h1>{m.not_found()}</h1>
          <Button asChild>
            <Link to="/">{m.back_home()}</Link>
          </Button>
        </div>
      );
    },
    errorComponent: ({ reset }) => {
      useLocale();
      return (
        <div className="empty-state" role="alert">
          <h1>{m.error_title()}</h1>
          <p>{m.error_description()}</p>
          <Button onClick={reset}>{m.try_again()}</Button>
        </div>
      );
    },
    shellComponent: ({ children }) => (
      <html lang={getLocale()} dir={getTextDirection()}>
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
      <LocaleProvider>
        <ConfirmationProvider>
          <Outlet />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
