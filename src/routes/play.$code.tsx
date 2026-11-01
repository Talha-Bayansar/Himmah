import { createFileRoute } from "@tanstack/react-router";
import LivePlayer from "../live/LivePlayer";
export const Route = createFileRoute("/play/$code")({
  component: () => <LivePlayer code={Route.useParams().code} />,
});
