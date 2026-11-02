import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { FormSurface } from "./form-surface";
import { m } from "../../paraglide/messages.js";
/** Secondary filters share one quiet entry point; selections apply immediately. */
export function DirectoryFilters({
  active = false,
  onReset,
  children,
}: {
  active?: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="directory-filter-control">
      <Button
        type="button"
        variant={active ? "secondary" : "outline"}
        aria-label={m.interface_filters()}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>{m.interface_filters()}</span>
        {active && (
          <span
            className="filter-active-indicator"
            aria-label={m.interface_active_filter()}
          >
            1
          </span>
        )}
      </Button>
      {open && (
        <FormSurface
          title={m.interface_filters()}
          description={m.interface_filter_help()}
          onClose={() => setOpen(false)}
        >
          <div className="directory-filter-options">{children}</div>
          <div className="directory-actions">
            <Button variant="outline" disabled={!active} onClick={onReset}>
              {m.interface_reset_filters()}
            </Button>
            <Button onClick={() => setOpen(false)}>{m.close()}</Button>
          </div>
        </FormSurface>
      )}
    </div>
  );
}
