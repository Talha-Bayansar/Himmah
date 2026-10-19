import { Coins } from "lucide-react";
import { m } from "../paraglide/messages.js";
export function EarningRule({
  amount = 0,
  version,
}: {
  amount?: number;
  version?: number;
}) {
  return (
    <div className="earning-rule">
      <Coins size={18} aria-hidden="true" />
      <div>
        <p>{amount > 0 ? m.earning_rule({ amount }) : m.earning_none()}</p>
        {version !== undefined && (
          <small>{m.earning_snapshot({ version })}</small>
        )}
      </div>
    </div>
  );
}
