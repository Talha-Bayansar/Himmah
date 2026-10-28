import { useFormNavigation } from "../../components/shared/form-navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Pencil, Unlink } from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import { ItemActions } from "../../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../../components/shared/infinite-list";
import { request, accessDenied } from "./client";
import {
  peopleBase,
  usePages,
  useSearch,
  SectionAdd,
  ErrorNotice,
  HistoryToggle,
  Picker,
  PeopleForm,
  usePeopleMutation,
  ReasonSheet,
} from "./shared";
import {
  PREVIEW_SIZE,
  CollectionCount,
  ViewAll,
  type ContactFilters,
} from "./collections";
import type {
  Contact,
  CommunicationAssignment,
  ContactRouting,
  CommunicationPreferences,
} from "./contracts";
const purposeLabel = (p: string) =>
  p === "routine" ? m.people_routine() : m.people_emergency();
const channelLabel = (c: string) =>
  c === "phone"
    ? m.people_phone()
    : c === "email"
      ? m.people_email()
      : m.people_any_channel();
export function Communication({
  org,
  user,
  contact,
  full = false,
  filters,
  onFiltersChange,
}: {
  org: string;
  user: string;
  contact: Contact;
  full?: boolean;
  filters?: ContactFilters | undefined;
  onFiltersChange?: ((next: ContactFilters) => void) | undefined;
}) {
  const openForm = useFormNavigation(org);
  const [purpose, setPurpose] = useState<"routine" | "emergency">("routine"),
    [preferences, setPreferences] = useState(false),
    [ending, setEnding] = useState<CommunicationAssignment | null>(null);
  const q = useSearch(full ? (filters?.q ?? "") : ""),
    history = full && (filters?.history ?? false),
    path = "/contacts/" + contact.id;
  const routing = useQuery({
    queryKey: ["people", user, org, "routing", contact.id],
    queryFn: ({ signal }) =>
      request<ContactRouting>(peopleBase(org) + path + "/routing", { signal }),
    retry: false,
  });
  const pages = usePages<CommunicationAssignment>(
    [
      "people",
      user,
      org,
      "communication",
      contact.id,
      full ? "full" : "preview",
      q,
      history,
    ],
    peopleBase(org) +
      path +
      "/communication?limit=" +
      (full ? 25 : PREVIEW_SIZE) +
      "&history=" +
      history +
      "&q=" +
      encodeURIComponent(q),
  );
  if (accessDenied(routing.error) || accessDenied(pages.error))
    return (
      <ErrorNotice
        error={accessDenied(routing.error) ? routing.error : pages.error}
      />
    );
  const route = routing.data?.[purpose];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          {!full && (
            <h2 className="text-xl font-semibold">
              {m.people_communication()}
            </h2>
          )}
          <CollectionCount
            total={pages.data?.pages[0]?.total}
            compact={!full}
          />
        </div>
        {!contact.archivedAt && (
          <SectionAdd
            label={m.people_add_communication()}
            onClick={() => openForm("communication", contact.id)}
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {m.people_communication_hint()}
      </p>
      {!contact.archivedAt && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={m.people_purpose()}
            >
              {(["routine", "emergency"] as const).map((p) => (
                <Button
                  key={p}
                  variant={purpose === p ? "default" : "outline"}
                  aria-pressed={purpose === p}
                  onClick={() => setPurpose(p)}
                >
                  {purposeLabel(p)}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={m.people_communication_preferences()}
              title={m.people_communication_preferences()}
              onClick={() => setPreferences(true)}
              disabled={!routing.data}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </div>
          {routing.isPending ? (
            <ListSkeleton />
          ) : routing.isError ? (
            <ErrorNotice error={routing.error} retry={routing.refetch} />
          ) : (
            route && (
              <div
                className="space-y-2 rounded-lg border p-3"
                aria-live="polite"
              >
                {!route.candidates.length && (
                  <p>{m.people_no_usable_method()}</p>
                )}
                {route.candidates.map((candidate, index) => (
                  <div
                    key={candidate.contactId + "-" + index}
                    className="min-w-0 space-y-1 break-words"
                  >
                    <Link
                      to="/workspace/$organizationId/people/contacts/$contactId"
                      params={{
                        organizationId: org,
                        contactId: candidate.contactId,
                      }}
                      className="font-medium underline"
                    >
                      {candidate.displayName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {candidate.direct
                        ? m.people_direct_contact()
                        : m.people_priority_value({
                            priority: candidate.priority,
                          })}
                    </p>
                    <MethodLinks
                      phone={candidate.phone}
                      email={candidate.email}
                    />
                  </div>
                ))}
                {route.missing > 0 && (
                  <p className="text-sm">
                    {m.people_missing_channels({ count: route.missing })}
                  </p>
                )}
                {route.alternatives > 1 && (
                  <p className="text-sm">
                    {m.people_routing_alternatives({
                      count: route.alternatives,
                    })}
                  </p>
                )}
              </div>
            )
          )}
        </>
      )}
      {full && (
        <div className="space-y-3">
          <Label htmlFor="communication-search">
            {m.people_search_responsibilities()}
          </Label>
          <Input
            id="communication-search"
            value={filters?.q ?? ""}
            maxLength={80}
            onChange={(e) => onFiltersChange?.({ q: e.target.value, history })}
          />
          <HistoryToggle
            checked={history}
            onChange={(h) =>
              onFiltersChange?.({ q: filters?.q ?? "", history: h })
            }
          />
        </div>
      )}
      {pages.isPending ? (
        <ListSkeleton />
      ) : pages.isError && !pages.data ? (
        <ErrorNotice error={pages.error} retry={pages.refetch} />
      ) : (
        <>
          {!pages.data?.pages.some((p) => p.items.length) && (
            <p>{m.people_no_communication()}</p>
          )}
          {pages.data?.pages
            .flatMap((p) => p.items)
            .slice(0, full ? undefined : PREVIEW_SIZE)
            .map((a) => (
              <Card density="compact" key={a.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1 break-words">
                    <Link
                      to="/workspace/$organizationId/people/contacts/$contactId"
                      params={{
                        organizationId: org,
                        contactId: a.responsibleContactId,
                      }}
                      className="font-medium underline"
                    >
                      {a.displayName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {purposeLabel(a.purpose)} ·{" "}
                      {m.people_priority_value({ priority: a.priority })} ·{" "}
                      {channelLabel(a.channel)}
                    </p>
                    {a.validTo ? (
                      <p className="text-sm">
                        {m.people_ended()}
                        {a.endReason &&
                          " · " +
                            (a.endReason === "contact_archived"
                              ? m.people_communication_contact_archived()
                              : a.endReason)}
                      </p>
                    ) : a.phone || a.email ? (
                      <MethodLinks phone={a.phone} email={a.email} />
                    ) : (
                      <p className="text-sm">{m.people_no_usable_method()}</p>
                    )}
                  </div>
                  {!contact.archivedAt && !a.validTo && (
                    <ItemActions
                      name={a.displayName}
                      actions={[
                        {
                          label: m.people_end_communication(),
                          icon: Unlink,
                          onSelect: () => setEnding(a),
                        },
                      ]}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          {full ? (
            <InfiniteFooter {...pages} />
          ) : (
            <ViewAll org={org} id={contact.id} view="communication" />
          )}
        </>
      )}

      {preferences && routing.data && (
        <PreferencesEditor
          org={org}
          user={user}
          contact={contact}
          preferences={routing.data.preferences}
          onClose={() => setPreferences(false)}
        />
      )}
      {ending && (
        <ReasonSheet
          org={org}
          user={user}
          title={m.people_end_communication()}
          description={m.people_end_communication_hint()}
          path={path + "/communication/" + ending.id}
          method="DELETE"
          body={{ version: contact.version, assignmentVersion: ending.version }}
          onClose={() => setEnding(null)}
        />
      )}
    </section>
  );
}
function MethodLinks({
  phone,
  email,
}: {
  phone: string | null;
  email: string | null;
}) {
  return (
    <div className="flex flex-col items-start">
      {phone && (
        <a
          className="inline-flex min-h-11 items-center break-all underline"
          href={"tel:" + phone.replace(/[ ()-]/g, "")}
        >
          {phone}
        </a>
      )}
      {email && (
        <a
          className="inline-flex min-h-11 items-center break-all underline"
          href={"mailto:" + email}
        >
          {email}
        </a>
      )}
    </div>
  );
}
export function AssignmentEditor({
  org,
  user,
  contact,
  onClose,
}: {
  org: string;
  user: string;
  contact: Contact;
  onClose: () => void;
}) {
  const mutation = usePeopleMutation(user, org),
    [version] = useState(contact.version),
    [selected, setSelected] = useState<Contact[]>([]),
    [invalid, setInvalid] = useState(false);
  const form = useForm({
    defaultValues: { purpose: "routine", channel: "any", priority: "1" },
    onSubmit: async ({ value }) => {
      const priority = Number(value.priority);
      if (
        !selected[0] ||
        !Number.isInteger(priority) ||
        priority < 1 ||
        priority > 99
      ) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      try {
        await mutation.mutateAsync({
          path: "/contacts/" + contact.id + "/communication",
          body: {
            ...value,
            priority,
            version,
            responsibleContactId: selected[0].id,
            responsibleVersion: selected[0].version,
          },
        });
        onClose();
      } catch {
        /* Keep the draft on failure. */
      }
    },
  });
  return (
    <PeopleForm
      page
      canLeave={() => mutation.isSuccess}
      title={m.people_add_communication()}
      description={contact.displayName + " · " + m.people_communication_hint()}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      dirty={() => form.state.isDirty || !!selected.length}
      pending={mutation.isPending}
      error={mutation.error}
    >
      <Picker<Contact>
        user={user}
        org={org}
        path="/contacts"
        label={m.people_search_contacts()}
        selected={selected}
        onChange={setSelected}
        itemLabel={(c) => c.displayName}
        excludeId={contact.id}
      />
      <form.Field name="purpose">
        {(f) => (
          <div className="space-y-2">
            <Label htmlFor="communication-purpose">{m.people_purpose()}</Label>
            <NativeSelect
              id="communication-purpose"
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            >
              {["routine", "emergency"].map((p) => (
                <NativeSelectOption value={p} key={p}>
                  {purposeLabel(p)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </form.Field>
      <form.Field name="channel">
        {(f) => (
          <div className="space-y-2">
            <Label htmlFor="communication-channel">{m.people_channel()}</Label>
            <NativeSelect
              id="communication-channel"
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            >
              {["any", "phone", "email"].map((c) => (
                <NativeSelectOption value={c} key={c}>
                  {channelLabel(c)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </form.Field>
      <form.Field name="priority">
        {(f) => (
          <div className="space-y-2">
            <Label htmlFor="communication-priority">
              {m.people_priority()}
            </Label>
            <Input
              id="communication-priority"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              required
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>
      {invalid && <p role="alert">{m.people_responsible_required()}</p>}
    </PeopleForm>
  );
}
function PreferencesEditor({
  org,
  user,
  contact,
  preferences,
  onClose,
}: {
  org: string;
  user: string;
  contact: Contact;
  preferences: CommunicationPreferences;
  onClose: () => void;
}) {
  const mutation = usePeopleMutation(user, org),
    [version] = useState(contact.version);
  const form = useForm({
    defaultValues: preferences,
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({
          path: "/contacts/" + contact.id + "/communication-preferences",
          method: "PATCH",
          body: { ...value, version },
        });
        onClose();
      } catch {
        /* Keep draft. */
      }
    },
  });
  return (
    <PeopleForm
      title={m.people_communication_preferences()}
      description={m.people_communication_hint()}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      dirty={() => form.state.isDirty}
      pending={mutation.isPending}
      error={mutation.error}
    >
      <form.Field name="routineDirectAllowed">
        {(f) => (
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={f.state.value}
              onCheckedChange={(v) => f.handleChange(v === true)}
            />
            {m.people_routine_direct()}
          </Label>
        )}
      </form.Field>
      <form.Field name="emergencyDirectAllowed">
        {(f) => (
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={f.state.value}
              onCheckedChange={(v) => f.handleChange(v === true)}
            />
            {m.people_emergency_direct()}
          </Label>
        )}
      </form.Field>
    </PeopleForm>
  );
}
