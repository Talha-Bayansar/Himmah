import { Alert, AlertDescription } from "../ui/alert";
import { ActionButton } from "./action-button";
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
    <div className="space-y-3">
      <Alert variant="destructive" role="alert">
        <AlertDescription>{directoryMessage(error)}</AlertDescription>
      </Alert>
      {retry && (
        <ActionButton variant="outline" pending={pending} onClick={retry}>
          {m.try_again()}
        </ActionButton>
      )}
    </div>
  );
}
