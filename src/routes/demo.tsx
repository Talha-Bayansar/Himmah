import { createFileRoute } from "@tanstack/react-router";
import Hub from "../hub/Hub";
export const Route = createFileRoute("/demo")({
  component: Hub,
  head: () => ({ meta: [{ title: "Explore the demo — Himmah Hub" }] }),
});
