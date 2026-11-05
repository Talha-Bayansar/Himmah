import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Pencil, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import {
  DirectoryHeader,
  DirectoryList,
  DirectoryItem,
} from "../../components/shared/directory-layout";
import { ItemActions } from "../../components/shared/item-actions";
import { ListSkeleton } from "../../components/shared/infinite-list";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import { Checkbox } from "../../components/ui/checkbox";
import { useConfirmation } from "../../components/shared/confirmation";
import { PeopleForm, peopleBase, ErrorNotice } from "./shared";
import { request, accessDenied } from "./client";
import { DirectoryError } from "../../community/client";
import {
  fieldKinds,
  fieldInput,
  type CustomField,
  type CustomValues,
  type FieldConfig,
  type FieldKind,
} from "./custom-field-contracts";
import { m } from "../../paraglide/messages.js";
import { useLocale } from "../../localization/locale";
export const kindLabel = (kind: FieldKind) =>
  ({
    text: m.fields_text,
    number: m.fields_number,
    date: m.fields_date,
    boolean: m.fields_boolean,
    choice: m.fields_choice,
  })[kind]();
export function CustomValueInputs({
  fields,
  values,
  onChange,
  disabled = false,
}: {
  fields: CustomField[];
  values: CustomValues;
  onChange: (v: CustomValues) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {fields
        .filter((f) => !f.archivedAt)
        .map((f) => (
          <div className="learning-field" key={f.id}>
            <Label htmlFor={"custom-" + f.id}>
              {f.label}
              {f.required && (
                <span className="activity-note"> · {m.fields_required()}</span>
              )}
            </Label>
            {f.kind === "choice" || f.kind === "boolean" ? (
              <NativeSelect
                id={"custom-" + f.id}
                disabled={disabled}
                required={f.required}
                value={String(values[f.id] ?? "")}
                onChange={(e) => {
                  const next = { ...values };
                  if (!e.target.value) delete next[f.id];
                  else
                    next[f.id] =
                      f.kind === "boolean"
                        ? e.target.value === "true"
                        : e.target.value;
                  onChange(next);
                }}
              >
                <NativeSelectOption value="">
                  {m.fields_choose()}
                </NativeSelectOption>
                {(f.kind === "boolean" ? ["true", "false"] : f.options).map(
                  (v) => (
                    <NativeSelectOption key={v} value={v}>
                      {f.kind === "boolean"
                        ? v === "true"
                          ? m.fields_yes()
                          : m.fields_no()
                        : v}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            ) : (
              <Input
                id={"custom-" + f.id}
                type={
                  f.kind === "number"
                    ? "number"
                    : f.kind === "date"
                      ? "date"
                      : "text"
                }
                step={f.kind === "number" ? "any" : undefined}
                min={
                  f.kind === "number"
                    ? -1e12
                    : f.kind === "date"
                      ? "0001-01-01"
                      : undefined
                }
                max={
                  f.kind === "number"
                    ? 1e12
                    : f.kind === "date"
                      ? "9999-12-31"
                      : undefined
                }
                maxLength={1000}
                required={f.required}
                disabled={disabled}
                value={String(values[f.id] ?? "")}
                onChange={(e) => {
                  const next = { ...values };
                  if (e.target.value === "") delete next[f.id];
                  else
                    next[f.id] =
                      f.kind === "number"
                        ? Number(e.target.value)
                        : e.target.value;
                  onChange(next);
                }}
              />
            )}
          </div>
        ))}
    </>
  );
}
export function ContactCustomValues({
  config,
  values,
}: {
  config?: FieldConfig | undefined;
  values: CustomValues;
}) {
  const visible =
    config?.fields.filter(
      (f) => values[f.id] !== undefined && values[f.id] !== "",
    ) ?? [];
  if (!visible.length) return null;
  return (
    <section className="space-y-3">
      <h2>{m.fields_details()}</h2>
      <dl className="custom-value-summary">
        {visible.map((f) => (
          <div key={f.id}>
            <dt>
              {f.label}
              {f.archivedAt && <small> · {m.insights_archived()}</small>}
            </dt>
            <dd>
              {typeof values[f.id] === "boolean"
                ? values[f.id]
                  ? m.fields_yes()
                  : m.fields_no()
                : String(values[f.id])}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export default function CustomFields({
  org,
  user,
}: {
  org: string;
  user: string;
}) {
  useLocale();
  const cache = useQueryClient(),
    confirm = useConfirmation();
  const [denied, setDenied] = useState<unknown>(null);
  const query = useQuery({
    enabled: !denied,
    queryKey: ["people", user, org, "custom-fields"],
    queryFn: ({ signal }) =>
      request<FieldConfig>(peopleBase(org) + "/custom-fields", { signal }),
    retry: false,
  });
  const [editing, setEditing] = useState<CustomField | null | undefined>(),
    [showArchived, setShowArchived] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request(peopleBase(org) + "/custom-fields", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["people", user, org, "custom-fields"],
      });
      await cache.invalidateQueries({
        queryKey: ["people-context", user, org],
      });
      await cache.invalidateQueries({ queryKey: ["people", user, org] });
    },
  });
  useEffect(() => {
    const error = [denied, query.error, mutation.error].find(accessDenied);
    if (!error) return;
    setDenied(error);
    for (const queryKey of [
      ["people", user, org],
      ["people-context", user, org],
    ]) {
      void cache.cancelQueries({ queryKey });
      cache.removeQueries({ queryKey });
    }
  }, [denied, query.error, mutation.error, cache, user, org]);
  if (denied || accessDenied(query.error) || accessDenied(mutation.error))
    return <ErrorNotice error={denied ?? query.error ?? mutation.error} />;
  return (
    <section className="directory form-page">
      <Button asChild variant="link" className="settings-back">
        <Link
          to="/workspace/$organizationId/$section"
          params={{ organizationId: org, section: "manage" }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.manage_title()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.fields_title()}
        description={m.fields_intro()}
        action={
          <Button
            disabled={!query.data || query.data.fields.length >= 50}
            onClick={() => setEditing(null)}
          >
            <Plus aria-hidden="true" />
            {m.fields_add()}
          </Button>
        }
      />
      <Label className="directory-check">
        <Checkbox
          checked={showArchived}
          onCheckedChange={(v) => setShowArchived(v === true)}
        />
        {m.directory_show_archived()}
      </Label>
      {mutation.isError && (
        <ErrorNotice
          error={mutation.error}
          saving
          retry={() => mutation.mutate(mutation.variables!)}
        />
      )}
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={query.refetch} />
      ) : (
        <>
          <DirectoryList label={m.fields_title()}>
            {query.data.fields
              .filter((f) => showArchived || !f.archivedAt)
              .map((f) => (
                <DirectoryItem key={f.id}>
                  <div className="directory-record-copy">
                    <strong>{f.label}</strong>
                    <p>
                      {kindLabel(f.kind)} ·{" "}
                      {f.archivedAt
                        ? m.insights_archived()
                        : f.required
                          ? m.fields_required()
                          : m.fields_optional()}
                    </p>
                  </div>
                  <ItemActions
                    name={f.label}
                    disabled={mutation.isPending}
                    actions={[
                      ...(!f.archivedAt
                        ? [
                            {
                              label: m.people_edit(),
                              icon: Pencil,
                              onSelect: () => setEditing(f),
                            },
                          ]
                        : []),
                      {
                        label: f.archivedAt
                          ? m.fields_restore()
                          : m.fields_archive(),
                        icon: f.archivedAt ? ArchiveRestore : Archive,
                        onSelect: async () => {
                          if (
                            await confirm({
                              title: f.archivedAt
                                ? m.fields_restore()
                                : m.fields_archive(),
                              description: f.archivedAt
                                ? m.fields_restore_help()
                                : m.fields_archive_help(),
                              confirmLabel: f.archivedAt
                                ? m.fields_restore()
                                : m.fields_archive(),
                            })
                          )
                            mutation.mutate({
                              operation: f.archivedAt ? "restore" : "archive",
                              id: f.id,
                              version: f.version,
                              key: crypto.randomUUID(),
                            });
                        },
                      },
                    ]}
                  />
                </DirectoryItem>
              ))}
          </DirectoryList>
          {!query.data.fields.some((f) => showArchived || !f.archivedAt) && (
            <p className="directory-empty">{m.fields_empty()}</p>
          )}
          <p className="activity-note">{m.fields_limit()}</p>
        </>
      )}
      {editing !== undefined && (
        <FieldEditor
          key={editing?.id ?? "new"}
          initial={editing}
          org={org}
          user={user}
          onClose={() => setEditing(undefined)}
          onDenied={setDenied}
        />
      )}
    </section>
  );
}
function FieldEditor({
  initial,
  org,
  user,
  onClose,
  onDenied,
}: {
  initial: CustomField | null;
  org: string;
  user: string;
  onClose: () => void;
  onDenied: (error: unknown) => void;
}) {
  const cache = useQueryClient();
  const [label, setLabel] = useState(initial?.label ?? ""),
    [kind, setKind] = useState<FieldKind>(initial?.kind ?? "text"),
    [required, setRequired] = useState(initial?.required ?? false),
    [options, setOptions] = useState(initial?.options.join("\n") ?? ""),
    [invalid, setInvalid] = useState(false);
  const command = useRef<Record<string, unknown> | null>(null),
    saved = useRef(false);
  const mutation = useMutation({
    mutationFn: (b: Record<string, unknown>) =>
      request(peopleBase(org) + "/custom-fields", {
        method: "POST",
        body: JSON.stringify(b),
      }),
    onSuccess: async () => {
      saved.current = true;
      await cache.invalidateQueries({
        queryKey: ["people", user, org, "custom-fields"],
      });
      await cache.invalidateQueries({
        queryKey: ["people-context", user, org],
      });
      onClose();
    },
  });
  useEffect(() => {
    if (accessDenied(mutation.error)) onDenied(mutation.error);
  }, [mutation.error, onDenied]);
  const known =
    mutation.error instanceof DirectoryError &&
    [
      "invalid_input",
      "duplicate_active_record",
      "version_conflict",
      "request_key_conflict",
      "not_found_or_forbidden",
      "verify_required",
      "sign_in",
    ].includes(mutation.error.code);
  const uncertain = mutation.isError && !known,
    locked = mutation.isPending || uncertain;
  const dirty =
    label !== (initial?.label ?? "") ||
    kind !== (initial?.kind ?? "text") ||
    required !== (initial?.required ?? false) ||
    options !== (initial?.options.join("\n") ?? "");
  const submit = () => {
    try {
      if (!uncertain)
        command.current = {
          ...fieldInput({
            label,
            kind,
            required,
            options:
              kind === "choice"
                ? options
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [],
          }),
          operation: initial ? "update" : "create",
          ...(initial ? { id: initial.id, version: initial.version } : {}),
          key: crypto.randomUUID(),
        };
      setInvalid(false);
      mutation.mutate(command.current!);
    } catch {
      setInvalid(true);
    }
  };
  return (
    <PeopleForm
      title={initial ? m.fields_edit() : m.fields_add()}
      description={m.fields_form_help()}
      onClose={onClose}
      onSubmit={submit}
      pending={mutation.isPending}
      dirty={() => !saved.current && dirty}
      error={mutation.error}
      canLeave={() => saved.current}
    >
      <fieldset className="form-fields" disabled={locked}>
        <div className="learning-field">
          <Label htmlFor="field-label">{m.fields_label()}</Label>
          <Input
            id="field-label"
            value={label}
            required
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="learning-field">
          <Label htmlFor="field-kind">{m.fields_type()}</Label>
          <NativeSelect
            id="field-kind"
            value={kind}
            disabled={!!initial}
            onChange={(e) => setKind(e.target.value as FieldKind)}
          >
            {fieldKinds.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {kindLabel(v)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {kind === "choice" && (
          <div className="learning-field">
            <Label htmlFor="field-options">{m.fields_options()}</Label>
            <Textarea
              id="field-options"
              rows={5}
              maxLength={3030}
              value={options}
              disabled={!!initial}
              onChange={(e) => setOptions(e.target.value)}
            />
          </div>
        )}
        <Label className="directory-check">
          <Checkbox
            checked={required}
            onCheckedChange={(v) => setRequired(v === true)}
          />
          {m.fields_required()}
        </Label>
        <p className="activity-note">{m.fields_required_help()}</p>
      </fieldset>
      {invalid && <p role="alert">{m.people_form_invalid()}</p>}
    </PeopleForm>
  );
}
