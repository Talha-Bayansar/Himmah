import { createFileRoute } from "@tanstack/react-router";
import OrganizationPortal from "../organization/OrganizationPortal";
export const Route = createFileRoute("/futsal/")({
  component: () => (
    <OrganizationPortal
      initialMode="signin"
      futsalLaunch
      futsal={{ page: "seasons" }}
    />
  ),
});
