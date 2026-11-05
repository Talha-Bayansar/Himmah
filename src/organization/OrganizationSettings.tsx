import { ErrorFeedback } from "../components/shared/feedback";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { PeopleForm, ErrorNotice } from "../modules/people/shared";
import { accessDenied } from "../modules/people/client";
import { directoryRequest, DirectoryError } from "../community/client";
import { ListSkeleton } from "../components/shared/infinite-list";
import { FormSurface } from "../components/shared/form-surface";
import { SearchField } from "../components/shared/search-field";
import {
  PickerTrigger,
  SelectionOption,
} from "../components/shared/selection-option";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { useConfirmation } from "../components/shared/confirmation";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import {
  settingsInput,
  minuteTime,
  timeMinute,
  type OrganizationSettings as Settings,
  type SettingsInput,
} from "./settings-contracts";
import type { Organization } from "./contracts";
export default function OrganizationSettings({
  organization,
  user,
}: {
  organization: Organization;
  user: string;
}) {
  useLocale();
  const cache = useQueryClient(),
    [denied, setDenied] = useState<unknown>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const key = ["organization", user, organization.id, "settings"];
  const query = useQuery({
    queryKey: key,
    enabled: !denied,
    retry: false,
    queryFn: ({ signal }) =>
      directoryRequest<Settings>(
        `/api/organizations/${organization.id}/settings`,
        { signal },
      ),
  });
  useEffect(() => {
    if (accessDenied(query.error)) {
      setDenied(query.error);
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    }
  }, [query.error, cache, user, organization.id]);
  if (denied || accessDenied(query.error) || (query.isError && !query.data))
    return (
      <ErrorNotice
        error={denied ?? query.error}
        {...(!denied ? { retry: () => query.refetch() } : {})}
      />
    );
  if (query.isPending || !query.data) return <ListSkeleton />;
  return (
    <SettingsEditor
      key={editorRevision}
      initial={query.data}
      refreshError={query.isError ? query.error : null}
      onRefresh={() => void query.refetch()}
      org={organization.id}
      user={user}
      onDenied={setDenied}
      onReload={async () => {
        const latest = await query.refetch();
        if (latest.data && !latest.isError) setEditorRevision((n) => n + 1);
      }}
    />
  );
}
function SettingsEditor({
  initial,
  org,
  user,
  onDenied,
  onReload,
  refreshError,
  onRefresh,
}: {
  initial: Settings;
  refreshError: unknown;
  onRefresh: () => void;
  org: string;
  user: string;
  onDenied: (error: unknown) => void;
  onReload: () => Promise<void>;
}) {
  const { locale } = useLocale() ?? { locale: "en" as const };
  const [draft, setDraft] = useState({
      ...initial,
      defaultLanguage: initial.defaultLanguage ?? locale,
    }),
    [picker, setPicker] = useState(false),
    [invalid, setInvalid] = useState(false),
    [reloading, setReloading] = useState(false);
  const baseline = useRef(
    JSON.stringify({
      ...initial,
      defaultLanguage: initial.defaultLanguage ?? locale,
    }),
  ).current;
  const saved = useRef(false),
    attempt = useRef<SettingsInput | null>(null),
    cache = useQueryClient(),
    navigate = useNavigate(),
    confirm = useConfirmation();
  const dirty = JSON.stringify(draft) !== baseline;
  const close = () =>
    void navigate({
      to: "/workspace/$organizationId/$section",
      params: { organizationId: org, section: "manage" },
    });
  const mutation = useMutation({
    mutationFn: (body: SettingsInput) =>
      directoryRequest(`/api/organizations/${org}/settings`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      saved.current = true;
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["organization", user, org] }),
        cache.invalidateQueries({ queryKey: ["organizations", user] }),
        cache.invalidateQueries({ queryKey: ["people-context", user, org] }),
        cache.invalidateQueries({ queryKey: ["people", user, org] }),
      ]);
      close();
    },
  });
  const code =
    mutation.error instanceof DirectoryError ? mutation.error.code : null;
  const known = [
    "invalid_input",
    "version_conflict",
    "request_key_conflict",
    "not_found_or_forbidden",
    "verify_required",
    "sign_in",
    "rate_limit",
  ].includes(code ?? "");
  const uncertain = mutation.isError && !known,
    locked = mutation.isPending || uncertain || reloading;
  useEffect(() => {
    if (accessDenied(mutation.error)) {
      onDenied(mutation.error);
      void cache.cancelQueries({
        queryKey: ["organization", user, org, "settings"],
      });
      cache.removeQueries({
        queryKey: ["organization", user, org, "settings"],
      });
    }
  }, [mutation.error, onDenied, cache, user, org]);
  const change = <K extends keyof typeof draft>(
    field: K,
    value: (typeof draft)[K],
  ) => setDraft((previous) => ({ ...previous, [field]: value }));
  const submit = () => {
    try {
      if (!uncertain)
        attempt.current = settingsInput({ ...draft, key: crypto.randomUUID() });
      setInvalid(false);
      mutation.mutate(attempt.current!);
    } catch {
      setInvalid(true);
    }
  };
  return (
    <PeopleForm
      page
      title={m.org_settings_title()}
      description={m.org_settings_intro()}
      onClose={close}
      onSubmit={submit}
      dirty={() => !saved.current && dirty}
      canLeave={() => saved.current}
      pending={mutation.isPending}
      error={mutation.error}
      submitDisabled={reloading || (!dirty && draft.version > 0)}
    >
      {!!refreshError && (
        <ErrorFeedback message={m.interface_load_error()} retry={onRefresh} />
      )}
      <fieldset disabled={locked} className="organization-settings-fields">
        <section className="settings-form-section">
          <h2>{m.org_settings_general()}</h2>
          <div className="learning-field">
            <Label htmlFor="org-name">{m.organization_name()}</Label>
            <Input
              id="org-name"
              required
              minLength={2}
              maxLength={100}
              value={draft.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </div>
          <div className="learning-field">
            <Label htmlFor="org-description">
              {m.org_settings_description()}
            </Label>
            <Textarea
              id="org-description"
              maxLength={1000}
              rows={3}
              value={draft.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </div>
          <div className="learning-field">
            <Label htmlFor="org-email">{m.org_settings_email()}</Label>
            <Input
              id="org-email"
              type="email"
              maxLength={254}
              autoComplete="email"
              value={draft.email}
              onChange={(e) => change("email", e.target.value)}
            />
          </div>
          <div className="learning-field">
            <Label htmlFor="org-phone">{m.org_settings_phone()}</Label>
            <Input
              id="org-phone"
              type="tel"
              maxLength={64}
              autoComplete="tel"
              placeholder="+32 …"
              value={draft.phone}
              onChange={(e) => change("phone", e.target.value)}
            />
          </div>
        </section>
        <section className="settings-form-section">
          <h2>{m.org_settings_regional()}</h2>
          <div className="learning-field">
            <Label>{m.timezone()}</Label>
            <PickerTrigger
              label={m.timezone()}
              open={picker}
              onClick={() => setPicker(true)}
            >
              {draft.timezone}
            </PickerTrigger>
          </div>
          <details className="session-help">
            <summary>{m.org_settings_timezone_help_title()}</summary>
            <p>{m.org_settings_timezone_help()}</p>
          </details>
          <div className="learning-field">
            <Label htmlFor="org-language">{m.org_settings_language()}</Label>
            <NativeSelect
              id="org-language"
              value={draft.defaultLanguage}
              onChange={(e) =>
                change("defaultLanguage", e.target.value as "en" | "nl" | "tr")
              }
            >
              <NativeSelectOption value="en">English</NativeSelectOption>
              <NativeSelectOption value="nl">Nederlands</NativeSelectOption>
              <NativeSelectOption value="tr">Türkçe</NativeSelectOption>
            </NativeSelect>
            <p className="activity-note">{m.org_settings_language_help()}</p>
          </div>
        </section>
        <section className="settings-form-section">
          <h2>{m.org_settings_notifications()}</h2>
          <Label className="directory-check">
            <Checkbox
              checked={draft.quietEnabled}
              onCheckedChange={(v) => change("quietEnabled", v === true)}
            />
            {m.org_settings_quiet_enabled()}
          </Label>
          <div className="settings-time-grid">
            <div className="learning-field">
              <Label htmlFor="org-quiet-start">
                {m.org_settings_quiet_start()}
              </Label>
              <Input
                id="org-quiet-start"
                type="time"
                required
                disabled={!draft.quietEnabled}
                value={
                  Number.isFinite(draft.quietStart)
                    ? minuteTime(draft.quietStart)
                    : ""
                }
                onChange={(e) =>
                  change("quietStart", timeMinute(e.target.value))
                }
              />
            </div>
            <div className="learning-field">
              <Label htmlFor="org-quiet-end">
                {m.org_settings_quiet_end()}
              </Label>
              <Input
                id="org-quiet-end"
                type="time"
                required
                disabled={!draft.quietEnabled}
                value={
                  Number.isFinite(draft.quietEnd)
                    ? minuteTime(draft.quietEnd)
                    : ""
                }
                onChange={(e) => change("quietEnd", timeMinute(e.target.value))}
              />
            </div>
          </div>
          <p className="activity-note">
            {m.org_settings_quiet_help({ timezone: draft.timezone })}
          </p>
        </section>
        <section className="settings-form-section">
          <h2>{m.fields_title()}</h2>
          <Button variant="link" className="settings-related-link" asChild>
            <Link
              to="/workspace/$organizationId/$section"
              params={{ organizationId: org, section: "custom-fields" }}
            >
              {m.org_settings_fields_link()}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      </fieldset>
      {invalid && <p role="alert">{m.org_settings_invalid()}</p>}
      {!uncertain && !saved.current && initial.version !== draft.version && (
        <p role="status">{m.org_settings_updated()}</p>
      )}
      {(code === "version_conflict" ||
        code === "request_key_conflict" ||
        (!uncertain &&
          !saved.current &&
          initial.version !== draft.version)) && (
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={async () => {
            if (
              !dirty ||
              (await confirm({
                title: m.people_discard(),
                description: m.people_discard_description(),
                confirmLabel: m.interface_discard(),
                destructive: true,
              }))
            ) {
              setReloading(true);
              try {
                await onReload();
              } finally {
                setReloading(false);
              }
            }
          }}
        >
          {m.org_settings_reload()}
        </Button>
      )}
      {picker && (
        <TimezonePicker
          current={draft.timezone}
          onSelect={(zone) => {
            change("timezone", zone);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </PeopleForm>
  );
}
function TimezonePicker({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(50);
  const zones = [
    ...new Set([current, "UTC", ...Intl.supportedValuesOf("timeZone")]),
  ].sort();
  const normalizeZone = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll("_", " ");
  const matches = zones.filter((zone) =>
    normalizeZone(zone).includes(normalizeZone(search.trim())),
  );
  const ordered = search.trim()
    ? matches
    : [current, ...matches.filter((z) => z !== current)];
  return (
    <FormSurface
      title={m.timezone()}
      description={m.org_settings_timezone_choose()}
      onClose={onClose}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {m.cancel()}
        </Button>
      }
    >
      <SearchField
        label={m.directory_search()}
        maxLength={80}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(50);
        }}
      />
      <div className="selection-list">
        {ordered.slice(0, limit).map((zone) => (
          <SelectionOption
            key={zone}
            selected={zone === current}
            onSelect={() => onSelect(zone)}
          >
            {zone.replaceAll("_", " ")}
          </SelectionOption>
        ))}
      </div>
      {!matches.length && <p>{m.directory_no_matches()}</p>}
      {matches.length > limit && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setLimit(limit + 50)}
        >
          {m.directory_load_more()}
        </Button>
      )}
    </FormSurface>
  );
}
