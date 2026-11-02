import { ErrorFeedback } from "./feedback";
import { directoryMessage } from "../../community/client";
import { m } from "../../paraglide/messages.js";
export function CollectionError({
  error,
  retry,
  pending = false,
}: {
  error: unknown;
  retry?: () => void;
  pending?: boolean;
}) {
  return (
    <ErrorFeedback
      message={directoryMessage(error, m.interface_request_unconfirmed())}
      retry={retry}
      pending={pending}
    />
  );
}
