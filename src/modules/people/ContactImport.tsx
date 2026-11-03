import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { PeopleShell } from "./PeopleShell";
import { request, peopleMessage } from "./client";
import { DirectoryError } from "../../community/client";
import { peopleBase } from "./shared";
import { FormSurface } from "../../components/shared/form-surface";
import { ErrorFeedback } from "../../components/shared/feedback";
import { ActionButton } from "../../components/shared/action-button";
import { useConfirmation } from "../../components/shared/confirmation";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import { MetricSummary } from "../../components/shared/metric-summary";
import { m } from "../../paraglide/messages.js";
import { useLocale } from "../../localization/locale";
import {
  importFields,
  IMPORT_BYTES,
  type ImportField,
  type ImportReview,
  type ImportResult,
  type ImportRow,
} from "./import-contracts";
import { parseContactCsv, mapContactCsv, type CsvData } from "./import-csv";
const blank: Record<ImportField, number> = {
  displayName: -1,
  givenName: -1,
  familyName: -1,
  email: -1,
  phone: -1,
};
function fieldName(field: ImportField) {
  return field === "displayName"
    ? m.people_name()
    : field === "givenName"
      ? m.people_given_label()
      : field === "familyName"
        ? m.people_family_label()
        : field === "email"
          ? m.people_email()
          : m.people_phone();
}
export default function ContactImport({
  organizationId,
}: {
  organizationId: string;
}) {
  useLocale();
  return (
    <PeopleShell
      organizationId={organizationId}
      section="contacts"
      tabs={false}
    >
      {(user) => (
        <ImportEditor
          key={user + ":" + organizationId}
          org={organizationId}
          user={user}
        />
      )}
    </PeopleShell>
  );
}
function ImportEditor({ org, user }: { org: string; user: string }) {
  const navigate = useNavigate(),
    cache = useQueryClient(),
    confirm = useConfirmation();
  const [data, setData] = useState<CsvData | null>(null),
    [fileName, setFileName] = useState(""),
    [mapping, setMapping] = useState(blank),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [excludeInvalid, setExcludeInvalid] = useState(false),
    [rows, setRows] = useState<ImportRow[]>([]),
    [review, setReview] = useState<ImportReview | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [visible, setVisible] = useState(25),
    [result, setResult] = useState<ImportResult | null>(null);
  const progress = useRef<HTMLElement>(null),
    feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: "instant" });
    else if (step > 0)
      progress.current?.scrollIntoView?.({
        block: "start",
        behavior: "instant",
      });
  }, [step, review, result]);
  const approved = useRef(false),
    readSequence = useRef(0),
    attempt = useRef<{
      rows: ImportRow[];
      selected: number[];
      snapshot: string;
      key: string;
    } | null>(null);
  const reviewMutation = useMutation({
    mutationFn: (value: ImportRow[]) =>
      request<ImportReview>(peopleBase(org) + "/contact-import/review", {
        method: "POST",
        body: JSON.stringify({ rows: value }),
      }),
    onSuccess: (value, submitted) => {
      save.reset();
      attempt.current = null;
      setRows(submitted);
      setReview(value);
      setSelected(
        value.rows
          .filter((r) => !r.matchCount && !r.fileMatches.length)
          .map((r) => r.row),
      );
      setVisible(25);
      setStep(2);
      setError("");
    },
  });
  const save = useMutation({
    mutationFn: (body: NonNullable<typeof attempt.current>) =>
      request<ImportResult>(peopleBase(org) + "/contact-import/commit", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (value) => {
      approved.current = true;
      setResult(value);
      await cache.invalidateQueries({ queryKey: ["people", user, org] });
      await cache.invalidateQueries({ queryKey: ["organization", user, org] });
    },
  });
  const code = save.error instanceof DirectoryError ? save.error.code : null,
    conflict = code === "version_conflict" || code === "request_key_conflict",
    known =
      !!code &&
      [
        "version_conflict",
        "request_key_conflict",
        "not_found_or_forbidden",
        "verify_required",
        "sign_in",
        "invalid_input",
        "people_unavailable",
      ].includes(code),
    uncertain = save.isError && !known;
  useEffect(() => {
    if (save.isError)
      feedback.current?.scrollIntoView?.({
        block: "end",
        behavior: "instant",
      });
  }, [save.isError]);
  const pending = reading || reviewMutation.isPending || save.isPending;
  useBlocker({
    shouldBlockFn: async () =>
      !approved.current &&
      (pending ||
        (!!data &&
          !(await confirm({
            title: m.people_discard(),
            description: m.people_discard_description(),
            confirmLabel: m.interface_discard(),
            destructive: true,
          })))),
    enableBeforeUnload: () => !approved.current && (pending || !!data),
  });
  const back = async () => {
    if (pending) return;
    if (step > 0 && !uncertain && !result) {
      setStep(step - 1);
      save.reset();
      return;
    }
    await navigate({
      to: "/workspace/$organizationId/people/contacts",
      params: { organizationId: org },
    });
  };
  let mapped: ReturnType<typeof mapContactCsv> = [],
    mappingValid = true;
  if (data) {
    try {
      mapped = mapContactCsv(data, mapping);
    } catch {
      mappingValid = false;
    }
  }
  const invalid = mapped.filter((r) => r.error),
    valid = mapped.flatMap((r) => (r.value ? [r.value] : []));
  if (result)
    return (
      <FormSurface
        page
        title={m.import_done()}
        description={m.import_done_help()}
        onClose={() => void back()}
      >
        <p role="status">
          {m.import_result({
            created: String(result.created),
            skipped: String(
              (data?.rows.length ?? rows.length) - result.created,
            ),
          })}
        </p>
        <Button asChild>
          <Link
            to="/workspace/$organizationId/people/contacts"
            params={{ organizationId: org }}
          >
            <Check aria-hidden="true" />
            {m.import_view_contacts()}
          </Link>
        </Button>
      </FormSurface>
    );
  return (
    <FormSurface
      page
      title={m.import_title()}
      description={m.import_help()}
      onClose={() => void back()}
    >
      <nav
        ref={progress}
        className="import-steps"
        aria-label={m.import_progress()}
      >
        {[m.import_upload(), m.import_columns(), m.import_review()].map(
          (label, index) => (
            <span
              key={label}
              aria-current={step === index ? "step" : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              {label}
            </span>
          ),
        )}
      </nav>
      <div className="form-layout contact-import">
        {step === 0 && (
          <section className="import-section">
            <h2>{m.import_upload()}</h2>
            <p className="activity-note">{m.import_file_help()}</p>
            <div className="learning-field">
              <Label htmlFor="import-file">{m.import_csv_file()}</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv,text/tab-separated-values"
                disabled={pending}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const sequence = ++readSequence.current;
                  setReading(true);
                  setError("");
                  try {
                    if (file.size > IMPORT_BYTES) throw Error();
                    const parsed = parseContactCsv(await file.text());
                    if (sequence !== readSequence.current) return;
                    setData(parsed);
                    setFileName(file.name);
                    setMapping(blank);
                    setExcludeInvalid(false);
                    setReview(null);
                    setSelected([]);
                    reviewMutation.reset();
                    save.reset();
                  } catch {
                    setData(null);
                    setError(m.import_file_error());
                  } finally {
                    if (sequence === readSequence.current) setReading(false);
                  }
                }}
              />
            </div>
            {data && (
              <p role="status">
                {fileName} ·{" "}
                {m.import_rows({ count: String(data.rows.length) })}
              </p>
            )}
            <details className="session-help">
              <summary>{m.import_format()}</summary>
              <p>{m.import_format_help()}</p>
              <pre className="import-example">
                {
                  "name,email,phone\nAlex Example,alex@example.test,+32470123456"
                }
              </pre>
            </details>
            <ActionButton
              pending={reading}
              disabled={!data}
              onClick={() => {
                setError("");
                setStep(1);
              }}
            >
              <ArrowRight aria-hidden="true" />
              {m.import_continue()}
            </ActionButton>
          </section>
        )}
        {step === 1 && data && (
          <section className="import-section">
            <h2>{m.import_columns()}</h2>
            <p className="activity-note">{m.import_mapping_help()}</p>
            <fieldset className="form-fields" disabled={pending}>
              {importFields.map((field) => (
                <div className="learning-field" key={field}>
                  <Label htmlFor={"import-" + field}>{fieldName(field)}</Label>
                  <NativeSelect
                    id={"import-" + field}
                    value={mapping[field]}
                    onChange={(e) => {
                      setMapping({
                        ...mapping,
                        [field]: Number(e.target.value),
                      });
                      setExcludeInvalid(false);
                      reviewMutation.reset();
                    }}
                  >
                    <NativeSelectOption value={-1}>
                      {m.import_not_mapped()}
                    </NativeSelectOption>
                    {data.headers.map((header, index) => (
                      <NativeSelectOption key={index} value={index}>
                        {index + 1} · {header || m.import_unnamed_column()}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {mapping[field] >= 0 && (
                    <p className="activity-note import-sample">
                      {m.import_example({
                        value:
                          data.rows[0]?.[mapping[field]]?.slice(0, 120) || "—",
                      })}
                    </p>
                  )}
                </div>
              ))}
            </fieldset>
            {!mappingValid && (
              <ErrorFeedback message={m.import_mapping_error()} />
            )}
            {mappingValid && invalid.length > 0 && (
              <>
                <ErrorFeedback
                  message={m.import_invalid_rows({
                    rows:
                      invalid
                        .slice(0, 10)
                        .map((r) => r.row)
                        .join(", ") + (invalid.length > 10 ? " …" : ""),
                  })}
                />
                <Label className="directory-check">
                  <Checkbox
                    checked={excludeInvalid}
                    onCheckedChange={(v) => setExcludeInvalid(v === true)}
                    disabled={pending}
                  />
                  {m.import_skip_invalid({ count: String(invalid.length) })}
                </Label>
              </>
            )}
            <div className="directory-actions">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setStep(0)}
              >
                <ArrowLeft aria-hidden="true" />
                {m.form_back()}
              </Button>
              <ActionButton
                pending={reviewMutation.isPending}
                disabled={
                  !mappingValid ||
                  !valid.length ||
                  (!!invalid.length && !excludeInvalid)
                }
                onClick={() => reviewMutation.mutate(valid)}
              >
                <ArrowRight aria-hidden="true" />
                {m.import_check_duplicates()}
              </ActionButton>
            </div>
          </section>
        )}
        {step === 2 && review && (
          <section className="import-section">
            <h2>{m.import_review()}</h2>
            <MetricSummary
              items={[
                { label: m.import_selected(), value: selected.length },
                {
                  label: m.import_skipped(),
                  value: (data?.rows.length ?? rows.length) - selected.length,
                },
              ]}
            />
            <p className="activity-note">{m.import_duplicate_help()}</p>
            <fieldset
              disabled={pending || uncertain || conflict}
              className="form-fields"
            >
              <div className="directory-actions">
                <Button
                  variant="link"
                  onClick={() =>
                    setSelected(
                      review.rows
                        .filter((r) => !r.matchCount && !r.fileMatches.length)
                        .map((r) => r.row),
                    )
                  }
                >
                  {m.import_select_new()}
                </Button>
                <Button variant="link" onClick={() => setSelected([])}>
                  {m.import_clear()}
                </Button>
              </div>
              <div className="import-rows">
                {review.rows.slice(0, visible).map((item) => {
                  const row = rows.find((r) => r.row === item.row)!;
                  return (
                    <div className="import-row" key={item.row}>
                      <Label className="directory-check">
                        <Checkbox
                          checked={selected.includes(item.row)}
                          onCheckedChange={(v) =>
                            setSelected((old) =>
                              v === true
                                ? [...old, item.row]
                                : old.filter((n) => n !== item.row),
                            )
                          }
                        />
                        <span>
                          <strong>{row.displayName}</strong>
                          <span className="import-row-number">
                            {m.import_source_row({ row: String(row.row) })}
                          </span>
                        </span>
                      </Label>
                      {!!item.matchCount && (
                        <p className="import-match">
                          {m.import_matches({ count: String(item.matchCount) })}{" "}
                          {item.matches
                            .map(
                              (match) =>
                                match.name +
                                (match.archived
                                  ? " (" + m.import_archived() + ")"
                                  : ""),
                            )
                            .join(", ")}
                        </p>
                      )}
                      {!!item.fileMatches.length && (
                        <p className="import-match">
                          {m.import_file_matches({
                            rows:
                              item.fileMatches.join(", ") +
                              (item.fileMatchCount > 5 ? " …" : ""),
                            count: String(item.fileMatchCount),
                          })}
                        </p>
                      )}
                      {row.methods.length > 0 && (
                        <p className="activity-note import-methods">
                          {row.methods
                            .map((method) => method.value)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {visible < review.rows.length && (
                <Button
                  variant="outline"
                  onClick={() => setVisible((v) => v + 25)}
                >
                  {m.import_more()}
                </Button>
              )}
            </fieldset>
            {save.isError && (
              <div className="import-feedback">
                <ErrorFeedback
                  message={
                    conflict
                      ? m.import_review_changed()
                      : peopleMessage(save.error, m.interface_save_error())
                  }
                />
              </div>
            )}
            {conflict && (
              <ActionButton
                variant="outline"
                pending={reviewMutation.isPending}
                onClick={() => {
                  reviewMutation.mutate(rows);
                }}
              >
                {m.import_refresh_review()}
              </ActionButton>
            )}
            <div ref={feedback} className="directory-actions import-commands">
              <Button
                variant="outline"
                disabled={pending || uncertain}
                onClick={() => {
                  setStep(1);
                  save.reset();
                }}
              >
                <ArrowLeft aria-hidden="true" />
                {m.import_columns()}
              </Button>
              <ActionButton
                pending={save.isPending}
                disabled={pending || conflict || !selected.length}
                onClick={() => {
                  const body =
                    uncertain && attempt.current
                      ? attempt.current
                      : {
                          rows,
                          selected: [...selected].sort((a, b) => a - b),
                          snapshot: review.snapshot,
                          key: crypto.randomUUID(),
                        };
                  attempt.current = body;
                  save.mutate(body);
                }}
              >
                <Upload aria-hidden="true" />
                {uncertain
                  ? m.try_again()
                  : m.import_create({ count: String(selected.length) })}
              </ActionButton>
            </div>
          </section>
        )}
        {error && <ErrorFeedback message={error} />}{" "}
        {reviewMutation.isError && (
          <ErrorFeedback
            message={peopleMessage(
              reviewMutation.error,
              m.interface_load_error(),
            )}
          />
        )}{" "}
      </div>
    </FormSurface>
  );
}
