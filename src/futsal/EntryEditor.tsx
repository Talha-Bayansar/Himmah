import { useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { Save, X, Search, UserCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { useConfirmation } from "../components/shared/confirmation";
import { useDirectoryPages } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { FutsalSeason, FutsalEntry } from "./contracts";
import {
  useFutsalWrite,
  isDenied,
  futsalKey,
  useFutsalPrivacyGuard,
} from "./client";
export function EntryEditor({
  organizationId,
  userId,
  season: initial,
  entry: initialEntry,
  onClose,
}: {
  organizationId: string;
  userId: string;
  season: FutsalSeason;
  entry?: FutsalEntry;
  onClose: () => void;
}) {
  useLocale();
  const season = useRef(initial).current,
    entry = useRef(initialEntry).current,
    dirty = useRef(false),
    confirm = useConfirmation();
  const [search, setSearch] = useState(""),
    [known, setKnown] = useState(
      () => new Map((entry?.members ?? []).map((p) => [p.id, p.name])),
    );
  const write = useFutsalWrite({
    path: `/api/organizations/${organizationId}/futsal/seasons/${season.id}/entries${entry ? "/" + entry.id : ""}`,
    method: entry ? "PATCH" : "POST",
    userId,
    organizationId,
    dirty,
    onSaved: onClose,
    onClose,
  });
  const form = useForm({
    defaultValues: {
      name: entry?.name ?? "",
      members: entry?.members.map((p) => p.id) ?? [],
    },
    onSubmit: async ({ value }) => {
      if (
        entry?.members.some((p) => !value.members.includes(p.id)) &&
        !write.uncertain &&
        !(await confirm({
          title: m.futsal_replace_members(),
          description: m.futsal_replace_members_help(),
          confirmLabel: m.directory_save(),
          destructive: true,
        }))
      )
        return;
      write.mutation.mutate({ ...value, version: season.version });
    },
  });
  dirty.current = useStore(form.store, (s) => s.isDirty);
  const selected = useStore(form.store, (s) => s.values.members);
  const candidates = useDirectoryPages<{
    id: string;
    name: string;
    createdAt: string;
    assignedTo: string | null;
  }>(
    [...futsalKey(userId, organizationId), "candidates", season.id, search],
    `/api/organizations/${organizationId}/futsal/seasons/${season.id}/candidates?q=${encodeURIComponent(search)}`,
  );
  useFutsalPrivacyGuard(candidates.error);
  const fatal =
    candidates.isError &&
    (!candidates.isFetchNextPageError || isDenied(candidates.error));
  const rows = candidates.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void write.close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {entry ? m.futsal_edit_entry() : m.futsal_add_entry()}
          </DialogTitle>
          <DialogDescription>
            {m.futsal_select_count({
              count: String(season.settings.playersPerTeam),
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <div>
                <Label htmlFor="entry-name">{m.futsal_entry_name()}</Label>
                <Input
                  id="entry-name"
                  autoComplete="off"
                  required
                  minLength={2}
                  maxLength={80}
                  disabled={write.frozen}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>
          <div className="futsal-picked" aria-live="polite">
            <strong>
              {m.futsal_selected({ count: String(selected.length) })}
            </strong>
            {selected.map((id) => (
              <span key={id}>
                {known.get(id) ??
                  rows.find((p) => p.id === id)?.name ??
                  m.futsal_members()}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={m.futsal_unselect({
                    name: known.get(id) ?? m.futsal_members(),
                  })}
                  disabled={write.frozen}
                  onClick={() =>
                    form.setFieldValue(
                      "members",
                      selected.filter((v) => v !== id),
                    )
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
          <div className="directory-toolbar">
            <Label>
              <Search aria-hidden="true" size={18} />
              <span className="sr-only">{m.directory_search()}</span>
              <Input
                type="search"
                maxLength={80}
                placeholder={m.directory_search()}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Label>
          </div>
          {candidates.isPending ? (
            <ListSkeleton />
          ) : fatal ? (
            <PointsError
              error={candidates.error}
              retry={() => void candidates.refetch()}
              pending={candidates.isFetching}
            />
          ) : (
            <>
              <ul className="futsal-candidates">
                {rows.map((person) => {
                  const elsewhere =
                    !!person.assignedTo && person.assignedTo !== entry?.id;
                  return (
                    <li key={person.id}>
                      <Label>
                        <Checkbox
                          checked={elsewhere || selected.includes(person.id)}
                          disabled={
                            write.frozen ||
                            elsewhere ||
                            (!selected.includes(person.id) &&
                              selected.length >= season.settings.playersPerTeam)
                          }
                          onCheckedChange={(checked) => {
                            setKnown((old) =>
                              new Map(old).set(person.id, person.name),
                            );
                            form.setFieldValue(
                              "members",
                              checked === true
                                ? [...selected, person.id]
                                : selected.filter((v) => v !== person.id),
                            );
                          }}
                        />
                        <span>
                          {person.name}
                          {elsewhere && (
                            <small>
                              <UserCheck aria-hidden="true" />
                              {m.futsal_assigned()}
                            </small>
                          )}
                        </span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
              {!rows.length ? (
                <p className="directory-empty">{m.directory_empty()}</p>
              ) : (
                <InfiniteFooter
                  {...candidates}
                  fetchNextPage={() =>
                    candidates.fetchNextPage({ cancelRefetch: false })
                  }
                />
              )}
            </>
          )}
          {write.mutation.isError && (
            <PointsError error={write.mutation.error} />
          )}
          {write.uncertain && <p>{m.futsal_uncertain()}</p>}
          <div className="directory-actions">
            <Button
              variant="outline"
              type="button"
              disabled={write.mutation.isPending}
              onClick={() => void write.close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={write.mutation.isPending}
              disabled={
                fatal || selected.length !== season.settings.playersPerTeam
              }
            >
              <Save aria-hidden="true" />
              {write.uncertain ? m.try_again() : m.directory_save()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
