import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

/** Page navigation remains real links with aria-current, not action buttons or fake tabpanels. */
export function RouteTabs({ className, ...props }: ComponentProps<"nav">) {
  return <nav className={cn("route-tabs", className)} {...props} />;
}
