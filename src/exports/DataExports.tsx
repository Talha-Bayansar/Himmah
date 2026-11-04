import { PickerTrigger } from "../components/shared/selection-option";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";
import { OptionPicker } from "../insights/OptionPicker";
import { DirectoryHeader } from "../components/shared/directory-layout";
import { ActionButton } from "../components/shared/action-button";
import { ErrorFeedback } from "../components/shared/feedback";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { SearchField } from "../components/shared/search-field";
import {
  directoryRequest,
  DirectoryError,
  directoryMessage,
} from "../community/client";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import type { Organization } from "../organization/contracts";
import {
  exportFilters,
  exportParams,
  exportKinds,
  type ExportFilters,
  type ExportKind,
  type ExportContext,
} from "./contracts";
import { prepareCsv } from "./client";
export function exportKindName(kind: ExportKind) {
  return kind === "contacts"
    ? m.export_contacts()
    : kind === "attendance"
      ? m.export_attendance()
      : kind === "balances"
        ? m.export_balances()
        : kind === "cash"
          ? m.export_cash()
          : kind === "insights-summary"
            ? m.export_insights_summary()
            : kind === "insights-trend"
              ? m.export_insights_trend()
              : m.export_insights_activities();
}
function help(kind: ExportKind, session: boolean) {
  return kind === "contacts"
    ? m.export_contacts_help()
    : kind === "attendance"
      ? session
        ? m.export_roster_help()
        : m.export_attendance_help()
      : kind === "balances"
        ? m.export_balances_help()
        : kind === "cash"
          ? m.export_cash_help()
          : m.export_insights_help();
}
export default function DataExports({
  organization,
  userId,
}: {
  organization: Organization;
  userId: string;
}) {
  const { locale } = useLocale() ?? { locale: "en" };
  const navigate = useNavigate(),
    cache = useQueryClient();
  const raw = useRouterState({
    select: (s) => s.location.search as Record<string, string>,
  });
  const signature = JSON.stringify(raw),
    canExport = ["owner", "admin"].includes(organization.role);
  const [picker, setPicker] = useState<"activities" | "groups" | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(null),
    [denied, setDenied] = useState(false),
    [prepared, setPrepared] = useState<{
      rows: number;
      generatedAt: string;
    } | null>(null);
  const commands = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (error || prepared)
      commands.current?.scrollIntoView?.({ block: "end", behavior: "instant" });
  }, [error, prepared]);
  const controller = useRef<AbortController | null>(null),
    live = useRef(true),
    currentSignature = useRef(signature),
    objectUrl = useRef<string | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  currentSignature.current = signature;
  const revoke = () => {
    if (timer.current) clearTimeout(timer.current);
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controller.current?.abort();
      revoke();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    revoke();
    setPrepared(null);
    setError(null);
    setPending(false);
    setPicker(null);
  }, [signature]);
  let filters: ExportFilters | null = null,
    invalid = false;
  try {
    const { origin: _, ...values } = raw;
    filters = exportFilters(
      { ...values, locale: values.locale || locale },
      organization.timezone,
    );
  } catch {
    invalid = true;
  }
  const context = useQuery({
    queryKey: [
      "organization",
      userId,
      organization.id,
      "exports",
      "context",
      filters?.activity ?? "",
      filters?.group ?? "",
      filters?.session ?? "",
    ],
    enabled: !!filters && !denied && canExport,
    queryFn: ({ signal }) =>
      directoryRequest<ExportContext>(
        `/api/organizations/${organization.id}/exports/context?${exportParams(filters!)}`,
        { signal },
      ),
    retry: false,
  });
  const accessLost = (value: unknown) =>
    value instanceof DirectoryError &&
    ["forbidden", "not_found", "sign_in", "verify_required"].includes(
      value.code,
    );
  function loseAccess() {
    setDenied(true);
    setPicker(null);
    setPrepared(null);
    controller.current?.abort();
    revoke();
    for (const type of ["exports", "insights-options"]) {
      const key = ["organization", userId, organization.id, type];
      void cache.cancelQueries({ queryKey: key });
      cache.removeQueries({ queryKey: key });
    }
  }
  useEffect(() => {
    if (accessLost(context.error)) loseAccess();
  }, [context.error]);
  const change = (
    update: Partial<Record<keyof ExportFilters | string, string>>,
  ) => {
    if (pending) return;
    void navigate({
      to: "/workspace/$organizationId/exports",
      params: { organizationId: organization.id },
      search: { ...raw, ...update },
      replace: true,
    });
  };
  const reset = () =>
    void navigate({
      to: "/workspace/$organizationId/exports",
      params: { organizationId: organization.id },
      search: {
        kind: exportKinds.includes(raw.kind as ExportKind)
          ? String(raw.kind)
          : "contacts",
        locale: ["en", "nl", "tr"].includes(raw.locale ?? "")
          ? String(raw.locale)
          : locale,
        origin: raw.origin ?? "manage",
      },
      replace: true,
    });
  const download = async () => {
    if (!filters || pending || !context.data) return;
    const savedSignature = signature,
      abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setError(null);
    setPrepared(null);
    revoke();
    try {
      const data = await prepareCsv(
        `/api/organizations/${organization.id}/exports?${exportParams(filters)}`,
        abort.signal,
      );
      if (
        !live.current ||
        abort.signal.aborted ||
        currentSignature.current !== savedSignature
      )
        return;
      revoke();
      const url = URL.createObjectURL(data.blob);
      objectUrl.current = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      timer.current = setTimeout(revoke, 60000);
      setPrepared({ rows: data.rows, generatedAt: data.generatedAt });
    } catch (value) {
      if (
        !live.current ||
        abort.signal.aborted ||
        currentSignature.current !== savedSignature
      )
        return;
      if (accessLost(value)) loseAccess();
      else setError(value);
    } finally {
      if (live.current && currentSignature.current === savedSignature)
        setPending(false);
    }
  };
  if (!canExport) return <ErrorFeedback message={m.people_denied()} />;
  if (denied)
    return (
      <ErrorFeedback
        message={m.people_denied()}
        retry={() => {
          setDenied(false);
          void context.refetch();
        }}
      />
    );
  let displayFilters = filters;
  if (!displayFilters) {
    try {
      const { origin: _, from, to, ...rest } = raw;
      displayFilters = {
        ...exportFilters(
          { ...rest, locale: rest.locale || locale },
          organization.timezone,
        ),
        from: from ?? "",
        to: to ?? "",
      };
    } catch {
      /* Invalid target/format choices require reset. */
    }
  }
  const f = displayFilters,
    origin = raw.origin ?? "manage";
  const back =
    origin === "contacts" ? (
      <Link
        to="/workspace/$organizationId/people/contacts"
        params={{ organizationId: organization.id }}
      >
        <ArrowLeft aria-hidden="true" />
        {m.people_contacts()}
      </Link>
    ) : origin === "insights" ? (
      <Link
        to="/workspace/$organizationId/insights"
        params={{ organizationId: organization.id }}
        search={{
          from: f?.from ?? "",
          to: f?.to ?? "",
          activity: f?.activity ?? "",
          group: f?.group ?? "",
          bucket: f?.bucket ?? "week",
        }}
      >
        <ArrowLeft aria-hidden="true" />
        {m.insights_title()}
      </Link>
    ) : f?.session ? (
      <Link
        to="/workspace/$organizationId/activities/$activityId/sessions/$sessionId/attendance"
        params={{
          organizationId: organization.id,
          activityId: f.activity,
          sessionId: f.session,
        }}
      >
        <ArrowLeft aria-hidden="true" />
        {m.management_title()}
      </Link>
    ) : (
      <Link
        to="/workspace/$organizationId/$section"
        params={{ organizationId: organization.id, section: "manage" }}
      >
        <ArrowLeft aria-hidden="true" />
        {m.manage_title()}
      </Link>
    );
  return (
    <section className="directory form-page exports-page">
      <Button asChild variant="link" className="settings-back">
        {back}
      </Button>
      <DirectoryHeader
        title={m.export_title()}
        description={m.export_intro()}
        autoFocus={false}
      />
      {!f ? (
        <>
          <ErrorFeedback message={m.export_invalid()} />
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {m.export_reset()}
          </Button>
        </>
      ) : (
        <div className="form-layout">
          {invalid && (
            <div className="exports-invalid">
              <ErrorFeedback message={m.export_invalid()} />
              <Button variant="outline" onClick={reset}>
                {m.export_reset()}
              </Button>
            </div>
          )}
          <fieldset disabled={pending} className="form-fields">
            <div className="learning-field">
              <Label htmlFor="export-kind">{m.export_report()}</Label>
              <NativeSelect
                id="export-kind"
                value={f.kind}
                onChange={(e) => {
                  const kind = e.target.value as ExportKind;
                  change({
                    kind,
                    q: "",
                    state: "active",
                    ...(kind === "contacts"
                      ? {
                          activity: "",
                          session: "",
                          from: exportFilters({}, organization.timezone).from,
                          to: exportFilters({}, organization.timezone).to,
                        }
                      : {}),
                    ...(kind.startsWith("insights") ? { session: "" } : {}),
                  });
                }}
              >
                {exportKinds
                  .filter(
                    (k) =>
                      !f.session ||
                      ["attendance", "balances", "cash"].includes(k),
                  )
                  .map((kind) => (
                    <NativeSelectOption key={kind} value={kind}>
                      {exportKindName(kind)}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
              <p className="activity-note">{help(f.kind, !!f.session)}</p>
            </div>
            {f.session ? (
              <div className="exports-scope">
                <strong>
                  {context.data?.sessionName || m.export_whole_session()}
                </strong>
                <p className="activity-note">{m.export_session_scope()}</p>
                <Button
                  variant="link"
                  onClick={() => change({ session: "", origin: "manage" })}
                >
                  {m.export_all_sessions()}
                </Button>
              </div>
            ) : (
              f.kind !== "contacts" && (
                <div className="exports-dates">
                  <div className="learning-field">
                    <Label htmlFor="export-from">{m.insights_from()}</Label>
                    <Input
                      id="export-from"
                      type="date"
                      min="2000-01-01"
                      max="2099-12-31"
                      value={f.from}
                      onChange={(e) => change({ from: e.target.value })}
                    />
                  </div>
                  <div className="learning-field">
                    <Label htmlFor="export-to">{m.insights_to()}</Label>
                    <Input
                      id="export-to"
                      type="date"
                      min="2000-01-01"
                      max="2099-12-31"
                      value={f.to}
                      onChange={(e) => change({ to: e.target.value })}
                    />
                  </div>
                </div>
              )
            )}
            {f.kind === "contacts" && (
              <>
                <SearchField
                  id="export-contact-search"
                  label={m.people_search()}
                  placeholder={m.people_search()}
                  value={raw.q ?? f.q}
                  maxLength={80}
                  onChange={(e) => change({ q: e.target.value })}
                />
                <div className="learning-field">
                  <Label htmlFor="export-state">
                    {m.export_contact_state()}
                  </Label>
                  <NativeSelect
                    id="export-state"
                    value={f.state}
                    onChange={(e) => change({ state: e.target.value })}
                  >
                    <NativeSelectOption value="active">
                      {m.export_active()}
                    </NativeSelectOption>
                    <NativeSelectOption value="archived">
                      {m.export_archived_contacts()}
                    </NativeSelectOption>
                    <NativeSelectOption value="all">
                      {m.insights_all()}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </>
            )}
            {f.kind !== "contacts" && !f.session && (
              <div className="learning-field">
                <Label>{m.insights_activity()}</Label>
                <PickerTrigger
                  label={m.insights_activity()}
                  open={picker === "activities"}
                  onClick={() => setPicker("activities")}
                >
                  {f.activity
                    ? context.data?.activityName ||
                      m.insights_selected_activity()
                    : m.insights_all()}
                </PickerTrigger>
              </div>
            )}
            <div className="learning-field">
              <Label>{m.insights_group()}</Label>
              <PickerTrigger
                label={m.insights_group()}
                open={picker === "groups"}
                onClick={() => setPicker("groups")}
              >
                {f.group
                  ? context.data?.groupName || m.insights_selected_group()
                  : m.insights_all()}
              </PickerTrigger>
            </div>
            {f.kind === "insights-trend" && (
              <div className="learning-field">
                <Label htmlFor="export-bucket">{m.insights_period()}</Label>
                <NativeSelect
                  id="export-bucket"
                  value={f.bucket}
                  onChange={(e) => change({ bucket: e.target.value })}
                >
                  <NativeSelectOption value="week">
                    {m.insights_weekly()}
                  </NativeSelectOption>
                  <NativeSelectOption value="month">
                    {m.insights_monthly()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
            <div className="learning-field">
              <Label htmlFor="export-language">{m.export_language()}</Label>
              <NativeSelect
                id="export-language"
                value={f.locale}
                onChange={(e) => change({ locale: e.target.value })}
              >
                <NativeSelectOption value="en">English</NativeSelectOption>
                <NativeSelectOption value="nl">Nederlands</NativeSelectOption>
                <NativeSelectOption value="tr">Türkçe</NativeSelectOption>
              </NativeSelect>
            </div>
          </fieldset>
          <p className="activity-note">
            {m.export_timezone({ timezone: organization.timezone })}
          </p>
          {context.isError && (
            <ErrorFeedback
              message={
                context.error instanceof DirectoryError &&
                context.error.code === "insights_filter"
                  ? m.directory_insights_filter()
                  : directoryMessage(context.error, m.interface_load_error())
              }
              retry={() => context.refetch()}
              pending={context.isFetching}
            />
          )}
          {!!error && (
            <ErrorFeedback
              message={
                error instanceof DirectoryError && error.code === "export_limit"
                  ? m.export_limit()
                  : directoryMessage(error, m.export_failed())
              }
            />
          )}
          {prepared && (
            <p role="status">
              {m.export_prepared({ rows: String(prepared.rows) })}{" "}
              <span className="activity-note">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: organization.timezone,
                }).format(new Date(prepared.generatedAt))}
              </span>
            </p>
          )}
          <ActionButton
            ref={commands}
            className="exports-download"
            pending={pending || context.isFetching}
            disabled={
              invalid || !context.data || context.isError || context.isFetching
            }
            onClick={() => void download()}
          >
            <Download aria-hidden="true" />
            {m.export_download()}
          </ActionButton>
          <details className="session-help">
            <summary>{m.export_file_details()}</summary>
            <p>{m.export_format_help()}</p>
            <p>{m.export_limits_help()}</p>
            <p>{m.export_groups_help()}</p>
          </details>
        </div>
      )}
      {picker && f && (
        <OptionPicker
          kind={picker}
          selected={f[picker === "activities" ? "activity" : "group"]}
          org={organization.id}
          user={userId}
          onSelect={(id) => {
            change({ [picker === "groups" ? "group" : "activity"]: id });
            setPicker(null);
          }}
          onAccessError={loseAccess}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
