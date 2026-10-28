import {
  PREVIEW_SIZE,
  CollectionCount,
  ViewAll,
  type ContactFilters,
} from "./collections";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { UserMinus, Unlink } from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import { Card, CardContent } from "../../components/ui/card";
import { ItemActions } from "../../components/shared/item-actions";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../../components/shared/infinite-list";
import { accessDenied } from "./client";
import {
  usePages,
  useSearch,
  peopleBase,
  SectionAdd,
  ErrorNotice,
  HistoryToggle,
  Picker,
  PeopleDialog,
  usePeopleMutation,
  ReasonDialog,
  localLabel,
} from "./shared";
import { MembershipDates, endReasonLabel } from "./Groups";
import type {
  Contact,
  ContactGroup,
  PeopleGroup,
  RelationshipType,
  ContactRelationship,
} from "./contracts";
export function ContactGroups({
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
  const history = full && (filters?.history ?? false),
    q = useSearch(full ? (filters?.q ?? "") : "");
  const [adding, setAdding] = useState(false),
    [ending, setEnding] = useState<ContactGroup | null>(null);
  const pages = usePages<ContactGroup>(
    [
      "people",
      user,
      org,
      "contact-groups",
      contact.id,
      full ? "full" : "preview",
      history,
      q,
    ],
    peopleBase(org) +
      "/contacts/" +
      contact.id +
      "/memberships?history=" +
      history +
      "&limit=" +
      (full ? 25 : PREVIEW_SIZE) +
      "&q=" +
      encodeURIComponent(q),
  );
  if (accessDenied(pages.error)) return <ErrorNotice error={pages.error} />;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          {!full && (
            <h2 className="text-xl font-semibold">{m.people_groups()}</h2>
          )}
          <CollectionCount
            total={pages.data?.pages[0]?.total}
            compact={!full}
          />
        </div>
        {!contact.archivedAt && (
          <SectionAdd
            label={m.people_add_to_group()}
            onClick={() => setAdding(true)}
          />
        )}
      </div>
      {full && (
        <div className="space-y-3">
          <Label htmlFor="groups-search">{m.people_search_groups()}</Label>
          <Input
            id="groups-search"
            value={filters?.q ?? ""}
            maxLength={80}
            onChange={(e) => onFiltersChange?.({ q: e.target.value, history })}
          />
          <HistoryToggle
            checked={history}
            onChange={(value) =>
              onFiltersChange?.({ q: filters?.q ?? "", history: value })
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
            <p>{m.people_no_contact_groups()}</p>
          )}
          {pages.data?.pages
            .flatMap((p) => p.items)
            .slice(0, full ? undefined : PREVIEW_SIZE)
            .map((member) => (
              <Card density="compact" key={member.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1 break-words">
                    <Link
                      className="font-semibold"
                      to="/workspace/$organizationId/people/groups/$groupId"
                      params={{ organizationId: org, groupId: member.groupId }}
                    >
                      {member.name}
                    </Link>
                    <MembershipDates
                      from={member.validFrom}
                      to={member.validTo}
                    />
                  </div>
                  {!member.validTo &&
                    !contact.archivedAt &&
                    !member.groupArchived && (
                      <ItemActions
                        name={member.name}
                        actions={[
                          {
                            label: m.people_end_membership(),
                            icon: UserMinus,
                            destructive: true,
                            onSelect: () => setEnding(member),
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
            <ViewAll org={org} id={contact.id} view="groups" />
          )}
        </>
      )}
      {adding && (
        <AddToGroup
          org={org}
          user={user}
          contact={contact}
          onClose={() => setAdding(false)}
        />
      )}{" "}
      {ending && (
        <ReasonDialog
          org={org}
          user={user}
          title={m.people_end_membership()}
          description={m.people_end_membership_hint()}
          path={"/groups/" + ending.groupId + "/members/" + ending.id}
          method="DELETE"
          body={{
            version: ending.groupVersion,
            membershipVersion: ending.version,
          }}
          onClose={() => setEnding(null)}
        />
      )}
    </section>
  );
}
function AddToGroup({
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
  const [selected, setSelected] = useState<
      (PeopleGroup & { assigned?: boolean })[]
    >([]),
    [version] = useState(contact.version),
    [invalid, setInvalid] = useState(false),
    [partial, setPartial] = useState(false),
    mutation = usePeopleMutation(user, org);
  const form = useForm({
    defaultValues: {},
    onSubmit: async () => {
      const group = selected[0];
      if (!group) return;
      try {
        const r = await mutation.mutateAsync({
          path: "/groups/" + group.id + "/assignments",
          body: {
            version: group.version,
            contacts: [{ id: contact.id, version }],
          },
        });
        if (
          r.outcomes?.every((o) =>
            ["saved", "already_member"].includes(o.outcome),
          )
        )
          onClose();
        else setPartial(true);
      } catch {
        /* Preserve draft. */
      }
    },
  });
  return (
    <PeopleDialog
      title={m.people_add_to_group()}
      description={m.people_group_assignment_hint()}
      pending={mutation.isPending}
      error={mutation.error}
      onClose={onClose}
      dirty={() => !!selected.length}
      onSubmit={() => {
        setInvalid(!selected.length);
        if (selected.length) void form.handleSubmit();
      }}
    >
      <Picker<PeopleGroup & { assigned?: boolean }>
        user={user}
        org={org}
        path={"/contacts/" + contact.id + "/group-options"}
        label={m.people_search_groups()}
        selected={selected}
        onChange={setSelected}
        itemLabel={(g) => g.name}
      />
      {invalid && <p role="alert">{m.people_choose_group()}</p>}
      {partial && <p role="alert">{m.people_conflict()}</p>}
    </PeopleDialog>
  );
}
export function ContactRelationships({
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
  const history = full && (filters?.history ?? false),
    q = useSearch(full ? (filters?.q ?? "") : "");
  const [adding, setAdding] = useState(false),
    [ending, setEnding] = useState<ContactRelationship | null>(null);
  const pages = usePages<ContactRelationship>(
    [
      "people",
      user,
      org,
      "contact-relationships",
      contact.id,
      full ? "full" : "preview",
      history,
      q,
    ],
    peopleBase(org) +
      "/contacts/" +
      contact.id +
      "/relationships?history=" +
      history +
      "&limit=" +
      (full ? 25 : PREVIEW_SIZE) +
      "&q=" +
      encodeURIComponent(q),
  );
  if (accessDenied(pages.error)) return <ErrorNotice error={pages.error} />;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          {!full && (
            <h2 className="text-xl font-semibold">
              {m.people_relationships()}
            </h2>
          )}
          <CollectionCount
            total={pages.data?.pages[0]?.total}
            compact={!full}
          />
        </div>
        {!contact.archivedAt && (
          <SectionAdd
            label={m.people_add_relationship()}
            onClick={() => setAdding(true)}
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {m.people_relationship_scope_hint()}
      </p>
      {full && (
        <div className="space-y-3">
          <Label htmlFor="relationships-search">
            {m.people_search_relationships()}
          </Label>
          <Input
            id="relationships-search"
            value={filters?.q ?? ""}
            maxLength={80}
            onChange={(e) => onFiltersChange?.({ q: e.target.value, history })}
          />
          <HistoryToggle
            checked={history}
            onChange={(value) =>
              onFiltersChange?.({ q: filters?.q ?? "", history: value })
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
            <p>{m.people_no_relationships()}</p>
          )}
          {pages.data?.pages
            .flatMap((p) => p.items)
            .slice(0, full ? undefined : PREVIEW_SIZE)
            .map((relation) => (
              <Card density="compact" key={relation.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1 break-words">
                    <Link
                      className="font-semibold"
                      to="/workspace/$organizationId/people/contacts/$contactId"
                      params={{
                        organizationId: org,
                        contactId: relation.contactId,
                      }}
                    >
                      {relation.displayName}
                    </Link>
                    <p>
                      {localLabel(
                        relation.subjectIsSource
                          ? relation.inverseLabels
                          : relation.forwardLabels,
                      )}
                    </p>
                    {relation.contactArchived && (
                      <p>{m.people_contact_archived()}</p>
                    )}
                    {relation.validTo && (
                      <MembershipDates
                        from={relation.validFrom}
                        to={relation.validTo}
                      />
                    )}{" "}
                    {relation.endReason && (
                      <p className="text-sm">
                        {endReasonLabel(relation.endReason)}
                      </p>
                    )}
                  </div>
                  {!relation.validTo && !contact.archivedAt && (
                    <ItemActions
                      name={relation.displayName}
                      actions={[
                        {
                          label: m.people_end_relationship(),
                          icon: Unlink,
                          destructive: true,
                          onSelect: () => setEnding(relation),
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
            <ViewAll org={org} id={contact.id} view="relationships" />
          )}
        </>
      )}
      {full && (
        <Button variant="link" asChild>
          <Link
            to="/workspace/$organizationId/manage/relationship-types"
            params={{ organizationId: org }}
          >
            {m.people_manage_relationship_types()}
          </Link>
        </Button>
      )}
      {adding && (
        <RelationshipEditor
          org={org}
          user={user}
          contact={contact}
          onClose={() => setAdding(false)}
        />
      )}{" "}
      {ending && (
        <ReasonDialog
          org={org}
          user={user}
          title={m.people_end_relationship()}
          description={m.people_end_relationship_hint()}
          path={"/contacts/" + contact.id + "/relationships/" + ending.id}
          method="DELETE"
          body={{
            version: contact.version,
            relationshipVersion: ending.version,
          }}
          onClose={() => setEnding(null)}
        />
      )}
    </section>
  );
}
function RelationshipEditor({
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
  const [selected, setSelected] = useState<Contact[]>([]),
    [types, setTypes] = useState<RelationshipType[]>([]),
    [version] = useState(contact.version),
    [invalid, setInvalid] = useState(false),
    mutation = usePeopleMutation(user, org);
  const form = useForm({
    defaultValues: { direction: "other_is_role" },
    onSubmit: async ({ value }) => {
      if (!selected[0] || !types[0]) return;
      try {
        await mutation.mutateAsync({
          path: "/contacts/" + contact.id + "/relationships",
          body: {
            version,
            otherContactId: selected[0].id,
            otherVersion: selected[0].version,
            typeId: types[0].id,
            typeVersionId: types[0].typeVersionId,
            direction: value.direction,
          },
        });
        onClose();
      } catch {
        /* Preserve draft and show conflict. */
      }
    },
  });
  return (
    <PeopleDialog
      title={m.people_add_relationship()}
      description={m.people_relationship_scope_hint()}
      pending={mutation.isPending}
      error={mutation.error}
      onClose={onClose}
      dirty={() => !!selected.length || !!types.length || form.state.isDirty}
      onSubmit={() => {
        setInvalid(!selected.length || !types.length);
        if (selected.length && types.length) void form.handleSubmit();
      }}
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
      <Picker<RelationshipType>
        user={user}
        org={org}
        path="/relationship-types"
        label={m.people_choose_relationship_type()}
        selected={types}
        onChange={setTypes}
        itemLabel={(t) => localLabel(t.forwardLabels)}
      />
      <form.Field name="direction">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="relationship-direction">
              {m.people_relationship_direction()}
            </Label>
            <NativeSelect
              id="relationship-direction"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={types[0]?.symmetric}
            >
              <NativeSelectOption value="other_is_role">
                {m.people_direction_other()}
              </NativeSelectOption>
              <NativeSelectOption value="subject_is_role">
                {m.people_direction_subject()}
              </NativeSelectOption>
            </NativeSelect>
            {selected[0] && types[0] && (
              <div className="space-y-2 rounded-lg bg-muted p-3" role="status">
                <p>
                  {m.people_relation_preview({
                    person:
                      field.state.value === "other_is_role"
                        ? selected[0].displayName
                        : contact.displayName,
                    role: localLabel(types[0].forwardLabels),
                    other:
                      field.state.value === "other_is_role"
                        ? contact.displayName
                        : selected[0].displayName,
                  })}
                </p>
                <p>
                  {m.people_relation_preview({
                    person:
                      field.state.value === "other_is_role"
                        ? contact.displayName
                        : selected[0].displayName,
                    role: localLabel(types[0].inverseLabels),
                    other:
                      field.state.value === "other_is_role"
                        ? selected[0].displayName
                        : contact.displayName,
                  })}
                </p>
              </div>
            )}
          </div>
        )}
      </form.Field>
      {invalid && (
        <p role="alert">{m.people_relationship_selection_required()}</p>
      )}
    </PeopleDialog>
  );
}
