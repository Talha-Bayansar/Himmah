import { useState, type ComponentProps } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { ActionButton } from "../components/shared/action-button";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "./contracts";

export function OrganizationSwitcher({
  current,
  items,
  loading,
  disabled,
  retryPending,
  error,
  retry,
  pagination,
  onSwitch,
  onManage,
}: {
  current: Organization | undefined;
  items: Organization[];
  loading: boolean;
  disabled: boolean;
  retryPending: boolean;
  error: string | null;
  retry: () => void;
  pagination: ComponentProps<typeof InfiniteFooter>;
  onSwitch: (organization: Organization) => void;
  onManage: () => void;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className="organization-switcher-trigger"
          aria-label={m.switch_organization()}
          aria-description={current?.name}
        >
          <Building2 size={20} aria-hidden="true" />
          <span>{current?.name ?? m.my_organizations()}</span>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{m.switch_organization()}</DialogTitle>
          <DialogDescription>{m.switch_organization_help()}</DialogDescription>
        </DialogHeader>
        <div className="organization-switcher-list">
          {loading ? (
            <ListSkeleton />
          ) : (
            <>
              {error && (
                <div role="alert">
                  <p>{error}</p>
                  <ActionButton
                    variant="outline"
                    pending={retryPending}
                    onClick={retry}
                  >
                    {m.try_again()}
                  </ActionButton>
                </div>
              )}
              <ul>
                {items.map((org) => (
                  <li key={org.id}>
                    <Button
                      variant="ghost"
                      aria-current={current?.id === org.id ? "true" : undefined}
                      onClick={() => {
                        setOpen(false);
                        if (org.id !== current?.id) onSwitch(org);
                      }}
                    >
                      <span>
                        <strong>{org.name}</strong>
                        <small>{m[`role_${org.role}`]()}</small>
                      </span>
                      {current?.id === org.id && (
                        <Check
                          size={18}
                          aria-label={m.current_organization()}
                        />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
              {(!error || items.length > 0) && (
                <InfiniteFooter {...pagination} />
              )}
            </>
          )}
        </div>
        <div className="directory-actions">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            {m.manage_organizations()}
          </Button>
          <Button onClick={() => setOpen(false)}>{m.done()}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
