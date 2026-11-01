import { createFileRoute } from "@tanstack/react-router";
import LivePlayer from "../live/LivePlayer";
export const Route = createFileRoute("/play/")({
  component: () => <LivePlayer />,
});
