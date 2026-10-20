import { PwaRegistration } from "../pwa/install";
import { splashScreens } from "../pwa/splash-screens";
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
    head: ({ matches }) => {
      const futsal = matches.some((match) =>
        match.pathname.startsWith("/futsal"),
      );
      return {
        meta: [
          { charSet: "utf-8" },
          { name: "referrer", content: "no-referrer" },
          {
            name: "viewport",
            content:
              "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual",
          },
          { name: "theme-color", content: "#12382f" },
          { name: "mobile-web-app-capable", content: "yes" },
          { name: "apple-mobile-web-app-capable", content: "yes" },
          {
            name: "apple-mobile-web-app-title",
            content: futsal ? "Himmah Futsal" : "Himmah",
          },
          { name: "apple-mobile-web-app-status-bar-style", content: "default" },
          { title: futsal ? m.futsal_title() : m.page_title() },
          {
            name: "description",
            content: m.page_description(),
          },
        ],
        links: [
          {
            rel: "manifest",
            href: `${futsal ? "/futsal" : ""}/manifest.${getLocale()}.webmanifest`,
          },
          {
            rel: "icon",
            href: futsal ? "/pwa/futsal/icon.svg" : "/pwa/icon.svg",
            type: "image/svg+xml",
          },
          {
            rel: "icon",
            href: futsal ? "/pwa/futsal/icon-32.png" : "/pwa/icon-32.png",
            type: "image/png",
            sizes: "32x32",
          },
          {
            rel: "apple-touch-icon",
            href: futsal
              ? "/pwa/futsal/icon-180.png"
              : "/pwa/apple-touch-icon.png",
            sizes: "180x180",
          },
          ...splashScreens.map(({ href, media }) => ({
            rel: "apple-touch-startup-image",
            href: futsal ? href.replace("/pwa/", "/pwa/futsal/") : href,
            media,
          })),
          { rel: "stylesheet", href: themeCss },
          { rel: "stylesheet", href: appCss },
        ],
      };
    },
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
          <PwaRegistration />
          <Outlet />
        </ConfirmationProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
