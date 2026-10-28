import { useForm } from "@tanstack/react-form";
import { reasonInput } from "./contracts";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Plus, Save, X } from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { ActionButton } from "../../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../../components/shared/infinite-list";
import { useConfirmation } from "../../components/shared/confirmation";
import { request, peopleMessage, accessDenied } from "./client";
import type { Page } from "../../community/contracts";
import type { LocalizedLabels } from "./contracts";
import type { CommandResult } from "./directory-store";
export const peopleBase = (org: string) => `/api/organizations/${org}/people`;
export const localLabel = (labels: LocalizedLabels) => labels[getLocale()];
export const PeopleAccessFailure = createContext<
  ((error: unknown) => void) | null
>(null);
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => unknown;
}) {
  const report = useContext(PeopleAccessFailure);
  useEffect(() => {
    if (accessDenied(error)) report?.(error);
  }, [error, report]);
  return (
    <div className="space-y-2">
      <p role="alert">{peopleMessage(error)}</p>
      {retry && !accessDenied(error) && (
        <Button variant="outline" onClick={() => void retry()}>
          {m.try_again()}
        </Button>
      )}
    </div>
  );
}
export function usePages<T>(
  key: readonly unknown[],
  path: string,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      request<Page<T> & { total?: number }>(
        path +
          (path.includes("?") ? "&" : "?") +
          (pageParam ? "cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: false,
  });
}
export function useSearch(value: string) {
  const [search, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  return search;
}
export function SectionAdd({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="people-section-add"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Plus aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
export function usePeopleMutation(user: string, org: string) {
  const qc = useQueryClient(),
    [key, setKey] = useState(() => crypto.randomUUID());
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body: Record<string, unknown>;
    }) =>
      request<CommandResult>(peopleBase(org) + path, {
        method,
        body: JSON.stringify({ ...body, requestKey: key }),
      }),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      await qc.invalidateQueries({ queryKey: ["people", user, org] });
    },
  });
}
export function PeopleDialog({
  title,
  description,
  onClose,
  onSubmit,
  dirty,
  pending,
  error,
  children,
  submitLabel,
  canLeave,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onSubmit: () => void;
  dirty: () => boolean;
  pending: boolean;
  error?: unknown;
  children: ReactNode;
  submitLabel?: string;
  canLeave?: () => boolean;
}) {
  const confirm = useConfirmation();
  const discard = () =>
    confirm({
      title: m.people_discard(),
      description: m.people_discard_description(),
      destructive: true,
    });
  const close = async () => {
    if (!pending && (!dirty() || (await discard()))) onClose();
  };
  useBlocker({
    shouldBlockFn: async () =>
      !canLeave?.() && (pending || (dirty() && !(await discard()))),
    enableBeforeUnload: () => !canLeave?.() && (pending || dirty()),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) onSubmit();
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            {children}
          </fieldset>
          {!!error && <ErrorNotice error={error} />}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton type="submit" pending={pending}>
              <Save aria-hidden="true" />
              {submitLabel ?? m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function Picker<T extends { id: string; assigned?: boolean }>({
  user,
  org,
  path,
  label,
  selected,
  onChange,
  itemLabel,
  multiple = false,
  max = 50,
  excludeId,
}: {
  user: string;
  org: string;
  path: string;
  label: string;
  selected: T[];
  onChange: (items: T[]) => void;
  itemLabel: (item: T) => string;
  multiple?: boolean;
  max?: number;
  excludeId?: string;
}) {
  const [query, setQuery] = useState(""),
    search = useSearch(query);
  const pages = usePages<T>(
    ["people", user, org, "picker", path, search],
    peopleBase(org) +
      path +
      (path.includes("?") ? "&" : "?") +
      "q=" +
      encodeURIComponent(search),
  );
  const inputId = "picker-" + path.replace(/[^a-z0-9]/gi, "-");
  return (
    <div className="space-y-3">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={query}
        maxLength={80}
        onChange={(e) => setQuery(e.target.value)}
      />
      {accessDenied(pages.error) ? (
        <ErrorNotice error={pages.error} />
      ) : pages.isPending ? (
        <ListSkeleton />
      ) : pages.isError && !pages.data ? (
        <ErrorNotice error={pages.error} retry={pages.refetch} />
      ) : (
        <>
          {pages.data?.pages
            .flatMap((p) => p.items)
            .filter((item) => item.id !== excludeId)
            .map((item) => {
              const picked = selected.some((s) => s.id === item.id),
                checked = item.assigned || picked;
              return (
                <Label
                  key={item.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border p-3"
                >
                  <Checkbox
                    aria-label={
                      itemLabel(item) +
                      (item.assigned ? " — " + m.people_already_member() : "")
                    }
                    checked={checked}
                    disabled={
                      item.assigned ||
                      (!picked && multiple && selected.length >= max)
                    }
                    onCheckedChange={(v) =>
                      onChange(
                        v === true
                          ? multiple
                            ? [...selected, item]
                            : [item]
                          : selected.filter((s) => s.id !== item.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {itemLabel(item)}
                    {item.assigned && (
                      <span className="block text-sm text-muted-foreground">
                        {m.people_already_member()}
                      </span>
                    )}
                  </span>
                </Label>
              );
            })}
          {!pages.data?.pages.some((p) =>
            p.items.some((i) => i.id !== excludeId),
          ) && <p>{m.people_empty_choices()}</p>}
          <InfiniteFooter {...pages} />
        </>
      )}
      {!!selected.length && (
        <div className="space-y-2">
          <p role="status" className="text-sm">
            {m.people_selected({ count: selected.length })}
          </p>
          <ul className="space-y-1" aria-label={m.people_selected_choices()}>
            {selected.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted px-3"
              >
                <span className="min-w-0 flex-1 break-words">
                  {itemLabel(item)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.people_deselect({ name: itemLabel(item) })}
                  onClick={() =>
                    onChange(selected.filter((s) => s.id !== item.id))
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {multiple && selected.length >= max && (
        <p>{m.people_selection_limit({ limit: max })}</p>
      )}
    </div>
  );
}
export function HistoryToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Label className="flex min-h-11 items-center gap-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      {m.people_include_history()}
    </Label>
  );
}
export function eventLabel(action: string) {
  const labels: Record<string, () => string> = {
    create: m.people_event_create,
    update: m.people_event_update,
    archive: m.people_archive,
    restore: m.people_restore,
    add_method: m.people_add_method,
    replace_method: m.people_edit_method,
    end_method: m.people_remove_method,
    group_joined: m.people_event_group_joined,
    group_left: m.people_event_group_left,
    group_archived: m.people_event_group_archived,
    add_relationship: m.people_event_relationship_added,
    end_relationship: m.people_event_relationship_ended,
    add_communication: m.people_add_communication,
    end_communication: m.people_end_communication,
    communication_preferences: m.people_communication_preferences,
    communication_contact_archived: m.people_communication_contact_archived,
  };
  return (labels[action] ?? m.people_event_update)();
}

export function ReasonDialog({
  org,
  user,
  title,
  description,
  path,
  method,
  body,
  onClose,
}: {
  org: string;
  user: string;
  title: string;
  description: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  onClose: () => void;
}) {
  const mutation = usePeopleMutation(user, org),
    [snapshot] = useState(body),
    [invalid, setInvalid] = useState(false);
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      try {
        const valid = reasonInput(value.reason);
        setInvalid(false);
        await mutation.mutateAsync({
          path,
          method,
          body: { ...snapshot, reason: valid },
        });
        onClose();
      } catch (error) {
        if (!(error instanceof Error) || error.name === "PeopleError")
          setInvalid(true);
      }
    },
  });
  return (
    <PeopleDialog
      title={title}
      description={description}
      onClose={onClose}
      dirty={() => form.state.isDirty}
      pending={mutation.isPending}
      error={mutation.error}
      submitLabel={title}
      onSubmit={() => {
        try {
          reasonInput(form.state.values.reason);
          setInvalid(false);
          void form.handleSubmit();
        } catch {
          setInvalid(true);
        }
      }}
    >
      <form.Field name="reason">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="change-reason">{m.people_reason()}</Label>
            <Input
              id="change-reason"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              maxLength={300}
              required
            />
          </div>
        )}
      </form.Field>
      {invalid && <p role="alert">{m.people_reason_required()}</p>}
    </PeopleDialog>
  );
}
