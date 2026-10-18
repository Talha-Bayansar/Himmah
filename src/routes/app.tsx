import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/app")({
  component: () => <OrganizationPortal initialMode="signin" launch />,
});
