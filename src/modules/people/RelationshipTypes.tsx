import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Archive, ArchiveRestore, Pencil, ArrowLeft } from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
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
import { useConfirmation } from "../../components/shared/confirmation";
import { PeopleShell } from "./PeopleShell";
import { accessDenied } from "./client";
import {
  peopleBase,
  usePages,
  useSearch,
  SectionAdd,
  ErrorNotice,
  PeopleDialog,
  usePeopleMutation,
  localLabel,
} from "./shared";
import { relationshipTypeInput, type RelationshipType } from "./contracts";
export default function RelationshipTypes({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <PeopleShell
      organizationId={organizationId}
      section="contacts"
      tabs={false}
    >
      {(user) => <TypeList org={organizationId} user={user} />}
    </PeopleShell>
  );
}
function TypeList({ org, user }: { org: string; user: string }) {
  const [q, setQ] = useState(""),
    search = useSearch(q),
    [archived, setArchived] = useState(false),
    [editing, setEditing] = useState<RelationshipType | "new" | null>(null),
    mutation = usePeopleMutation(user, org),
    confirm = useConfirmation();
  const list = usePages<RelationshipType>(
    ["people", user, org, "types", search, archived],
    peopleBase(org) +
      "/relationship-types?q=" +
      encodeURIComponent(search) +
      "&archived=" +
      archived,
  );
  const archive = async (t: RelationshipType) => {
    if (
      await confirm({
        title: t.archivedAt ? m.people_restore_type() : m.people_archive_type(),
        description: m.people_type_archive_hint(),
        confirmLabel: t.archivedAt
          ? m.people_restore_type()
          : m.people_archive_type(),
        destructive: !t.archivedAt,
      })
    )
      mutation.mutate({
        path:
          "/relationship-types/" +
          t.id +
          (t.archivedAt ? "/restore" : "/archive"),
        body: { version: t.version },
      });
  };
  if (accessDenied(list.error)) return <ErrorNotice error={list.error} />;
  return (
    <>
      <Button variant="link" asChild>
        <Link
          to="/workspace/$organizationId/people/contacts"
          params={{ organizationId: org }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.people_contacts()}
        </Link>
      </Button>
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold">
          {m.people_relationship_types()}
        </h1>
        <SectionAdd
          label={m.people_add_type()}
          onClick={() => setEditing("new")}
        />
      </div>
      <p>{m.people_type_hint()}</p>
      <Label htmlFor="type-search">{m.people_search_types()}</Label>
      <Input
        id="type-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={80}
      />
      <Label className="flex min-h-11 items-center gap-3">
        <Checkbox
          checked={archived}
          onCheckedChange={(v) => setArchived(v === true)}
        />
        {m.people_archived_types()}
      </Label>
      {mutation.isError && <ErrorNotice error={mutation.error} />}
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError && !list.data ? (
        <ErrorNotice error={list.error} retry={list.refetch} />
      ) : (
        <>
          {!list.data?.pages.some((p) => p.items.length) && (
            <p>{m.people_no_types()}</p>
          )}
          {list.data?.pages
            .flatMap((p) => p.items)
            .map((t) => (
              <Card density="compact" key={t.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1 break-words">
                    <h2 className="font-semibold">
                      {localLabel(t.forwardLabels)} /{" "}
                      {localLabel(t.inverseLabels)}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t.symmetric
                        ? m.people_symmetric()
                        : m.people_directional()}{" "}
                      ·{" "}
                      {t.category === "family"
                        ? m.people_family_category()
                        : m.people_other_category()}
                    </p>
                  </div>
                  <ItemActions
                    name={localLabel(t.forwardLabels)}
                    disabled={mutation.isPending}
                    pending={
                      mutation.isPending &&
                      mutation.variables?.path.includes(t.id)
                    }
                    actions={
                      t.archivedAt
                        ? [
                            {
                              label: m.people_restore_type(),
                              icon: ArchiveRestore,
                              onSelect: () => archive(t),
                            },
                          ]
                        : [
                            {
                              label: m.people_edit_type(),
                              icon: Pencil,
                              onSelect: () => setEditing(t),
                            },
                            {
                              label: m.people_archive_type(),
                              icon: Archive,
                              destructive: true,
                              onSelect: () => archive(t),
                            },
                          ]
                    }
                  />
                </CardContent>
              </Card>
            ))}
          <InfiniteFooter {...list} />
        </>
      )}
      {editing && (
        <TypeEditor
          org={org}
          user={user}
          type={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function TypeEditor({
  org,
  user,
  type,
  onClose,
}: {
  org: string;
  user: string;
  type: RelationshipType | undefined;
  onClose: () => void;
}) {
  const [version] = useState(type?.version),
    [invalid, setInvalid] = useState(false),
    mutation = usePeopleMutation(user, org);
  const form = useForm({
    defaultValues: {
      symmetric: type?.symmetric ?? false,
      category: type?.category ?? "family",
      forward_en: type?.forwardLabels.en ?? "",
      forward_nl: type?.forwardLabels.nl ?? "",
      forward_tr: type?.forwardLabels.tr ?? "",
      inverse_en: type?.inverseLabels.en ?? "",
      inverse_nl: type?.inverseLabels.nl ?? "",
      inverse_tr: type?.inverseLabels.tr ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        const forwardLabels = {
            en: value.forward_en,
            nl: value.forward_nl,
            tr: value.forward_tr,
          },
          inverseLabels = value.symmetric
            ? forwardLabels
            : {
                en: value.inverse_en,
                nl: value.inverse_nl,
                tr: value.inverse_tr,
              };
        const input = relationshipTypeInput(
          { ...value, forwardLabels, inverseLabels },
          !type,
        );
        await mutation.mutateAsync({
          path: "/relationship-types" + (type ? "/" + type.id : ""),
          method: type ? "PATCH" : "POST",
          body: { ...input, ...(type ? { version } : {}) },
        });
        onClose();
      } catch {
        /* Show error, retain labels. */
      }
    },
  });
  const validate = () => {
    const value = form.state.values,
      forwardLabels = {
        en: value.forward_en,
        nl: value.forward_nl,
        tr: value.forward_tr,
      };
    relationshipTypeInput(
      {
        ...value,
        forwardLabels,
        inverseLabels: value.symmetric
          ? forwardLabels
          : {
              en: value.inverse_en,
              nl: value.inverse_nl,
              tr: value.inverse_tr,
            },
      },
      !type,
    );
  };
  return (
    <PeopleDialog
      title={type ? m.people_edit_type() : m.people_add_type()}
      description={m.people_type_version_hint()}
      pending={mutation.isPending}
      error={mutation.error}
      dirty={() => form.state.isDirty}
      onClose={onClose}
      onSubmit={() => {
        try {
          validate();
          setInvalid(false);
          void form.handleSubmit();
        } catch {
          setInvalid(true);
        }
      }}
    >
      <form.Field name="symmetric">
        {(field) => (
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={field.state.value}
              disabled={!!type}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            {m.people_symmetric()}
          </Label>
        )}
      </form.Field>
      <form.Field name="category">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="type-category">{m.people_type_category()}</Label>
            <NativeSelect
              id="type-category"
              value={field.state.value}
              disabled={!!type}
              onChange={(e) =>
                field.handleChange(e.target.value as "family" | "other")
              }
            >
              <NativeSelectOption value="family">
                {m.people_family_category()}
              </NativeSelectOption>
              <NativeSelectOption value="other">
                {m.people_other_category()}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        )}
      </form.Field>
      {(["en", "nl", "tr"] as const).map((locale) => (
        <fieldset className="space-y-3 rounded-lg border p-3" key={locale}>
          <legend>
            {locale === "en"
              ? m.people_language_en()
              : locale === "nl"
                ? m.people_language_nl()
                : m.people_language_tr()}
          </legend>
          <form.Field name={`forward_${locale}`}>
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={"forward-" + locale}>
                  {m.people_forward_label()}
                </Label>
                <Input
                  id={"forward-" + locale}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  maxLength={80}
                  required
                />
              </div>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.symmetric}>
            {(symmetric) =>
              !symmetric && (
                <form.Field name={`inverse_${locale}`}>
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={"inverse-" + locale}>
                        {m.people_inverse_label()}
                      </Label>
                      <Input
                        id={"inverse-" + locale}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>
        </fieldset>
      ))}
      {invalid && <p role="alert">{m.people_type_labels_required()}</p>}
    </PeopleDialog>
  );
}
