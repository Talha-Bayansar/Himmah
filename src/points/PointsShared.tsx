import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionButton } from "../components/shared/action-button";
import { directoryMessage } from "../community/client";
import { m } from "../paraglide/messages.js";
import type { PointsResult } from "./contracts";
export function PointsError({
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
export function PointsResults({ result }: { result: PointsResult }) {
  return (
    <div className="points-results" role="status">
      <h2>{m.points_results()}</h2>
      <ul>
        {result.items.map((item, index) => (
          <li key={item.personId}>
            <strong>{item.name || String(index + 1)}</strong>
            <span>{m[`points_${item.outcome}`]()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
