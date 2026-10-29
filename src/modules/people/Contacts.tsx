import { FormSurface } from "../../components/shared/form-surface";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../../components/shared/directory-layout";
import { Communication } from "./Communication";
import {
  PREVIEW_SIZE,
  CollectionCount,
  ViewAll,
  collectionTitle,
  type ContactView,
  type ContactFilters,
} from "./collections";
import { PeopleShell } from "./PeopleShell";
import {
  ErrorNotice,
  usePages,
  peopleBase as base,
  eventLabel,
  useSearch,
} from "./shared";
import { ContactGroups, ContactRelationships } from "./ContactLinks";
import { useEffect, useState, useRef } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronRight,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowLeft,
  Save,
  X,
} from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useLocale } from "../../localization/locale";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { ActionButton } from "../../components/shared/action-button";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../../components/shared/infinite-list";
import { useConfirmation } from "../../components/shared/confirmation";
import { ItemActions } from "../../components/shared/item-actions";
import { request, peopleMessage, accessDenied } from "./client";
import {
  contactInput,
  methodInput,
  type Contact,
  type ContactMethod,
} from "./contracts";

export default function Contacts({
  organizationId,
  contactId,
  view,
  filters,
  onFiltersChange,
}: {
  organizationId: string;
  contactId?: string;
  view?: ContactView;
  filters?: ContactFilters;
  onFiltersChange?: (next: ContactFilters) => void;
}) {
  useLocale();
  return (
    <PeopleShell
      organizationId={organizationId}
      section="contacts"
      tabs={!contactId}
    >
      {(user) =>
        contactId ? (
          <ContactDetail
            org={organizationId}
            user={user}
            id={contactId}
            view={view}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        ) : (
          <ContactList org={organizationId} user={user} />
        )
      }
    </PeopleShell>
  );
}

function ContactList({ org, user }: { org: string; user: string }) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  const list = usePages<Contact>(
    ["people", user, org, "contacts", query, archived],
    base(org) +
      "/contacts?q=" +
      encodeURIComponent(query) +
      "&archived=" +
      archived,
  );
  if (accessDenied(list.error)) return <ErrorNotice error={list.error} />;
  return (
    <section className="directory">
      <DirectoryHeader
        title={m.people_contacts()}
        description={m.directory_roster_help()}
        action={
          <Button onClick={() => setEditing(true)}>
            <Plus aria-hidden="true" />
            {m.people_add()}
          </Button>
        }
      />
      <DirectoryToolbar
        id="contact-search"
        label={m.people_search()}
        value={search}
        onChange={setSearch}
      >
        <Label className="directory-archived">
          <Checkbox
            checked={archived}
            onCheckedChange={(v) => setArchived(v === true)}
          />
          {m.people_archived()}
        </Label>
      </DirectoryToolbar>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError && !list.data ? (
        <ErrorNotice error={list.error} />
      ) : (
        <>
          {!list.data?.pages.some((p) => p.items.length) && (
            <p className="directory-empty">{m.people_empty()}</p>
          )}
          <DirectoryList
            label={m.people_contacts()}
            busy={list.isFetchingNextPage}
          >
            {list.data?.pages
              .flatMap((p) => p.items)
              .map((c) => (
                <DirectoryItem key={c.id} linked>
                  <Link
                    className="directory-item-link"
                    to="/workspace/$organizationId/people/contacts/$contactId"
                    params={{ organizationId: org, contactId: c.id }}
                  >
                    <DirectoryRecord name={c.displayName} />
                    <ChevronRight aria-hidden="true" size={18} />
                  </Link>
                </DirectoryItem>
              ))}
          </DirectoryList>
          <InfiniteFooter {...list} />
        </>
      )}
      {editing && (
        <Editor org={org} user={user} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}
function ContactDetail({
  org,
  user,
  id,
  view,
  filters,
  onFiltersChange,
}: {
  org: string;
  user: string;
  id: string;
  view: ContactView | undefined;
  filters: ContactFilters | undefined;
  onFiltersChange: ((next: ContactFilters) => void) | undefined;
}) {
  const query = useQuery({
    queryKey: ["people", user, org, "contact", id],
    queryFn: ({ signal }) =>
      request<Contact>(base(org) + "/contacts/" + id, { signal }),
    retry: false,
  });
  const q = useSearch(view === "methods" ? (filters?.q ?? "") : "");
  const methods = usePages<ContactMethod>(
    [
      "people",
      user,
      org,
      "methods",
      id,
      view === "methods" ? "full" : "preview",
      q,
    ],
    base(org) +
      "/contacts/" +
      id +
      "/methods?limit=" +
      (view === "methods" ? 25 : PREVIEW_SIZE) +
      "&q=" +
      encodeURIComponent(q),
    !!query.data && !query.isError && (!view || view === "methods"),
  );
  const history = usePages<{
    id: string;
    action: string;
    version: number;
    createdAt: string;
  }>(
    [
      "people",
      user,
      org,
      "history",
      id,
      view === "history" ? "full" : "preview",
    ],
    base(org) +
      "/contacts/" +
      id +
      "/history?limit=" +
      (view === "history" ? 25 : PREVIEW_SIZE),
    !!query.data && !query.isError && (!view || view === "history"),
  );
  const [editing, setEditing] = useState(false),
    [adding, setAdding] = useState(false);
  const [editingMethod, setEditingMethod] = useState<
    ContactMethod | undefined
  >();
  const qc = useQueryClient(),
    confirm = useConfirmation();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: async ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body: Record<string, unknown>;
      method?: string;
    }) =>
      request(base(org) + "/contacts/" + id + path, {
        method,
        body: JSON.stringify({
          ...body,
          requestKey: key,
        }),
      }),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      await qc.invalidateQueries({ queryKey: ["people", user, org] });
    },
  });
  if (query.isError) return <ErrorNotice error={query.error} />;
  if (
    ((!view || view === "methods") && accessDenied(methods.error)) ||
    ((!view || view === "history") && accessDenied(history.error))
  )
    return (
      <ErrorNotice
        error={accessDenied(methods.error) ? methods.error : history.error}
      />
    );
  if (!query.data) return <ListSkeleton />;
  const contact = query.data;
  async function archive() {
    if (
      await confirm({
        title: contact.archivedAt ? m.people_restore() : m.people_archive(),
        description: contact.archivedAt
          ? m.people_contact_restore_hint()
          : m.people_archive_groups_description({
              count: contact.activeGroupCount ?? 0,
            }) +
            " " +
            m.people_archive_communication_warning({
              count: contact.communicationDependentCount ?? 0,
            }),
        confirmLabel: contact.archivedAt
          ? m.people_restore()
          : m.people_archive(),
        destructive: !contact.archivedAt,
      })
    )
      mutation.mutate({
        path: contact.archivedAt ? "/restore" : "/archive",
        body: { version: contact.version },
      });
  }
  const actions = [
    { label: m.people_edit(), icon: Pencil, onSelect: () => setEditing(true) },
    {
      label: contact.archivedAt ? m.people_restore() : m.people_archive(),
      icon: contact.archivedAt ? ArchiveRestore : Archive,
      onSelect: () => void archive(),
    },
  ];
  return (
    <div className="directory-profile space-y-6">
      <Button variant="link" asChild>
        {view ? (
          <Link
            to="/workspace/$organizationId/people/contacts/$contactId"
            params={{ organizationId: org, contactId: id }}
          >
            <ArrowLeft aria-hidden="true" />
            {contact.displayName}
          </Link>
        ) : (
          <Link
            to="/workspace/$organizationId/people/contacts"
            params={{ organizationId: org }}
          >
            <ArrowLeft aria-hidden="true" />
            {m.people_contacts()}
          </Link>
        )}
      </Button>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold">
            {view ? collectionTitle(view) : contact.displayName}
          </h1>
          {view && (
            <p className="break-words text-muted-foreground">
              {contact.displayName}
            </p>
          )}
        </div>
        {!view && (
          <ItemActions
            name={contact.displayName}
            actions={contact.archivedAt ? [actions[1]!] : actions}
            disabled={mutation.isPending}
            pending={mutation.isPending}
          />
        )}
      </div>
      {contact.archivedAt && <p>{m.people_contact_archived()}</p>}
      {mutation.isError && <ErrorNotice error={mutation.error} />}
      {!view && (contact.givenName || contact.familyName) && (
        <Card density="compact">
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 [&>div]:min-w-0 [&>div]:break-words">
              {contact.givenName && (
                <div>
                  <dt className="text-sm text-muted-foreground">
                    {m.people_given_label()}
                  </dt>
                  <dd>{contact.givenName}</dd>
                </div>
              )}
              {contact.familyName && (
                <div>
                  <dt className="text-sm text-muted-foreground">
                    {m.people_family_label()}
                  </dt>
                  <dd>{contact.familyName}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {(!view || view === "methods") && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              {!view && (
                <h2 className="text-xl font-semibold">{m.people_methods()}</h2>
              )}
              <CollectionCount
                total={methods.data?.pages[0]?.total}
                compact={!view}
              />
            </div>
            {!contact.archivedAt && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="people-section-add"
                aria-label={m.people_add_method()}
                title={m.people_add_method()}
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden="true" />
                <span className="hidden sm:inline">
                  {m.people_add_method()}
                </span>
              </Button>
            )}
          </div>
          {view === "methods" && (
            <div className="space-y-2">
              <Label htmlFor="method-search">{m.people_search_methods()}</Label>
              <Input
                id="method-search"
                value={filters?.q ?? ""}
                maxLength={80}
                onChange={(e) =>
                  onFiltersChange?.({ q: e.target.value, history: false })
                }
              />
            </div>
          )}
          {methods.isPending ? (
            <ListSkeleton />
          ) : methods.isError && !methods.data ? (
            <ErrorNotice error={methods.error} />
          ) : (
            <>
              {!methods.data?.pages.some((p) => p.items.length) && (
                <p>{m.people_no_methods()}</p>
              )}
              {methods.data?.pages
                .flatMap((p) => p.items)
                .slice(0, view ? undefined : PREVIEW_SIZE)
                .map((method) => (
                  <Card density="compact" key={method.id}>
                    <CardContent className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 break-words">
                        <p>{method.value}</p>
                        {method.preferred && (
                          <span>{m.people_preferred()}</span>
                        )}
                      </div>
                      {!contact.archivedAt && (
                        <ItemActions
                          name={method.value}
                          disabled={mutation.isPending}
                          pending={
                            mutation.isPending &&
                            mutation.variables?.path === "/methods/" + method.id
                          }
                          actions={[
                            {
                              label: m.people_edit_method(),
                              icon: Pencil,
                              onSelect: () => setEditingMethod(method),
                            },
                            {
                              label: m.people_remove_method(),
                              icon: Trash2,
                              destructive: true,
                              onSelect: async () => {
                                if (
                                  await confirm({
                                    title: m.people_remove_method(),
                                    description: m.people_remove_description(),
                                    destructive: true,
                                    confirmLabel: m.people_remove_method(),
                                  })
                                )
                                  mutation.mutate({
                                    path: "/methods/" + method.id,
                                    method: "DELETE",
                                    body: { version: contact.version },
                                  });
                              },
                            },
                          ]}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              {view ? (
                <InfiniteFooter {...methods} />
              ) : (
                <ViewAll org={org} id={id} view="methods" />
              )}
            </>
          )}
        </section>
      )}
      {(!view || view === "communication") && (
        <Communication
          org={org}
          user={user}
          contact={contact}
          full={view === "communication"}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      )}
      {(!view || view === "groups") && (
        <ContactGroups
          org={org}
          user={user}
          contact={contact}
          full={view === "groups"}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      )}
      {(!view || view === "relationships") && (
        <ContactRelationships
          org={org}
          user={user}
          contact={contact}
          full={view === "relationships"}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      )}
      {(!view || view === "history") && (
        <section className="space-y-3">
          <div className="flex items-baseline gap-2">
            {!view && (
              <h2 className="text-xl font-semibold">{m.people_history()}</h2>
            )}
            <CollectionCount
              total={history.data?.pages[0]?.total}
              compact={!view}
            />
          </div>
          {history.isPending ? (
            <ListSkeleton />
          ) : history.isError && !history.data ? (
            <ErrorNotice error={history.error} />
          ) : (
            <>
              {!history.data?.pages.some((p) => p.items.length) && (
                <p>{m.people_no_history()}</p>
              )}
              {history.data?.pages
                .flatMap((p) => p.items)
                .slice(0, view ? undefined : PREVIEW_SIZE)
                .map((event) => (
                  <p key={event.id}>
                    {eventLabel(event.action)} ·{" "}
                    {new Date(event.createdAt).toLocaleString(getLocale())} ·{" "}
                    {event.version}
                  </p>
                ))}
              {view ? (
                <InfiniteFooter {...history} />
              ) : (
                <ViewAll org={org} id={id} view="history" />
              )}
            </>
          )}
        </section>
      )}
      {editing && (
        <Editor
          org={org}
          user={user}
          contact={contact}
          onClose={() => setEditing(false)}
        />
      )}
      {editingMethod && (
        <Editor
          org={org}
          user={user}
          contact={contact}
          method
          existingMethod={editingMethod}
          onClose={() => setEditingMethod(undefined)}
        />
      )}
      {adding && (
        <Editor
          org={org}
          user={user}
          contact={contact}
          method
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
function Editor({
  org,
  user,
  contact,
  method = false,
  existingMethod,
  onClose,
}: {
  org: string;
  user: string;
  contact?: Contact;
  method?: boolean;
  existingMethod?: ContactMethod;
  onClose: () => void;
}) {
  const confirm = useConfirmation(),
    qc = useQueryClient(),
    navigate = useNavigate();
  const [key] = useState(() => crypto.randomUUID());
  const committed = useRef(false);
  const [version] = useState(contact?.version);
  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      request<{ id: string }>(
        base(org) +
          "/contacts" +
          (contact ? "/" + contact.id : "") +
          (method
            ? "/methods" + (existingMethod ? "/" + existingMethod.id : "")
            : ""),
        {
          method: existingMethod || (contact && !method) ? "PATCH" : "POST",
          body: JSON.stringify({
            ...body,
            requestKey: key,
            ...(contact ? { version } : {}),
          }),
        },
      ),
  });
  const form = useForm({
    defaultValues: {
      displayName: contact?.displayName ?? "",
      givenName: contact?.givenName ?? "",
      familyName: contact?.familyName ?? "",
      kind: existingMethod?.kind ?? "phone",
      value: existingMethod?.value ?? "",
      preferred: existingMethod?.preferred ?? false,
    },
    onSubmit: async ({ value }) => {
      try {
        const body = method ? methodInput(value) : contactInput(value);
        const result = await mutation.mutateAsync({ ...body });
        await qc.invalidateQueries({ queryKey: ["people", user, org] });
        committed.current = true;
        onClose();
        if (!contact)
          await navigate({
            to: "/workspace/$organizationId/people/contacts/$contactId",
            params: { organizationId: org, contactId: result.id },
          });
      } catch {
        /* mutation or validation error rendered below */
      }
    },
  });
  const [validation, setValidation] = useState(false);
  async function close() {
    if (mutation.isPending) return;
    if (
      !form.state.isDirty ||
      (await confirm({
        title: m.people_discard(),
        description: m.people_discard_description(),
        destructive: true,
      }))
    )
      onClose();
  }
  useBlocker({
    shouldBlockFn: async () =>
      mutation.isPending ||
      (!committed.current &&
        form.state.isDirty &&
        !mutation.isSuccess &&
        !(await confirm({
          title: m.people_discard(),
          description: m.people_discard_description(),
          destructive: true,
        }))),
    enableBeforeUnload: () =>
      mutation.isPending ||
      (!committed.current && form.state.isDirty && !mutation.isSuccess),
  });
  return (
    <FormSurface
      title={
        method
          ? existingMethod
            ? m.people_edit_method()
            : m.people_add_method()
          : contact
            ? m.people_edit()
            : m.people_add()
      }
      description={method ? m.people_method_hint() : m.people_name_hint()}
      onClose={() => void close()}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (method) methodInput(form.state.values);
            else contactInput(form.state.values);
            setValidation(false);
            void form.handleSubmit();
          } catch {
            setValidation(true);
          }
        }}
      >
        {method ? (
          <>
            <form.Field name="kind">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="method-kind">{m.people_kind()}</Label>
                  <NativeSelect
                    id="method-kind"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as "phone" | "email")
                    }
                  >
                    <NativeSelectOption value="phone">
                      {m.people_phone()}
                    </NativeSelectOption>
                    <NativeSelectOption value="email">
                      {m.people_email()}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              )}
            </form.Field>
            <form.Field name="value">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="method-value">{m.people_value()}</Label>
                  <Input
                    id="method-value"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="off"
                    maxLength={254}
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="preferred">
              {(field) => (
                <Label className="flex items-center gap-3">
                  <Checkbox
                    checked={field.state.value}
                    onCheckedChange={(v) => field.handleChange(v === true)}
                  />
                  {m.people_preferred()}
                </Label>
              )}
            </form.Field>
          </>
        ) : (
          <>
            {(["displayName", "givenName", "familyName"] as const).map(
              (name, index) => (
                <form.Field key={name} name={name}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={name}>
                        {index === 0
                          ? m.people_name()
                          : index === 1
                            ? m.people_given()
                            : m.people_family()}
                      </Label>
                      <Input
                        id={name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        maxLength={120}
                        required={index === 0}
                      />
                    </div>
                  )}
                </form.Field>
              ),
            )}
          </>
        )}
        {validation && <p role="alert">{m.people_invalid()}</p>}
        {mutation.isError && <ErrorNotice error={mutation.error} />}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => void close()}
          >
            <X aria-hidden="true" />
            {m.cancel()}
          </Button>
          <ActionButton type="submit" pending={mutation.isPending}>
            <Save aria-hidden="true" />
            {m.directory_save()}
          </ActionButton>
        </div>
      </form>
    </FormSurface>
  );
}
