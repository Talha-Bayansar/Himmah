import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/futsal/profile")({
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      accountSettings
      futsal={{ page: "seasons" }}
    />
  ),
});
