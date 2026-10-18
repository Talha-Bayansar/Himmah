import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import { ActionButton } from "./action-button";
import { useLocale } from "../../localization/locale";
import { m } from "../../paraglide/messages.js";
export type ItemAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  destructive?: boolean;
};
export function ItemActions({
  name,
  actions,
  pending = false,
  disabled = false,
}: {
  name: string;
  actions: ItemAction[];
  pending?: boolean;
  disabled?: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const queued = useRef<ItemAction | null>(null);
  const frame = useRef(0);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      queued.current = null;
    },
    [],
  );
  if (!actions.length) return null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <ActionButton
          ref={trigger}
          variant="outline"
          size="icon"
          className="item-actions-trigger"
          aria-label={m.directory_actions_for({ name })}
          pending={pending}
          disabled={disabled}
        >
          {!pending && <MoreHorizontal size={20} aria-hidden="true" />}
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="item-actions-menu"
        onCloseAutoFocus={(event) => {
          const action = queued.current;
          queued.current = null;
          if (!action) return;
          event.preventDefault();
          // Wait for the menu's focus/scroll lock to release before opening a dialog.
          trigger.current?.focus({ preventScroll: true });
          frame.current = requestAnimationFrame(() => {
            void action.onSelect();
          });
        }}
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={() => {
              queued.current = action;
              setOpen(false);
            }}
          >
            <action.icon size={18} aria-hidden="true" />
            <span>{action.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
