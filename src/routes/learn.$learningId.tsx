import { createFileRoute } from "@tanstack/react-router";
import Participant from "../learning/Participant";
export const Route = createFileRoute("/learn/$learningId")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: () => (
    <Participant
      key={Route.useParams().learningId}
      item={Route.useParams().learningId}
    />
  ),
});
