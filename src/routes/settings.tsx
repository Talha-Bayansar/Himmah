import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/settings")({
  component: () => <OrganizationPortal initialMode="signin" accountSettings />,
});
