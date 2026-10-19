import { useRef, useState, type MutableRefObject } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Save, X, Check, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsOptions, type PointsOption } from "../points/PointsOptions";
import { PointsError } from "../points/PointsShared";
import { directoryRequest, DirectoryError } from "../community/client";
import { localTime } from "../activities/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { Challenge, Submission, Candidate } from "./contracts";
import type { Organization } from "../organization/contracts";
function useWrite({
  path,
  userId,
  org,
  onSaved,
  onClose,
  dirty,
}: {
  path: string;
  userId: string;
  org: string;
  onSaved: (id: string) => void;
  onClose: () => void;
  dirty: MutableRefObject<boolean>;
}) {
  const attempt = useRef<Record<string, unknown> | null>(null),
    saved = useRef(false),
    client = useQueryClient(),
    confirm = useConfirmation();
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      attempt.current ??= { ...body, key: crypto.randomUUID() };
      return directoryRequest<{ item: { id: string } }>(path, {
        method: "POST",
        body: JSON.stringify(attempt.current),
      });
    },
    onSuccess: async (data) => {
      saved.current = true;
      await client.invalidateQueries({
        queryKey: ["organization", userId, org],
      });
      onSaved(data.item.id);
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      ) {
        attempt.current = null;
        void client.invalidateQueries({
          queryKey: ["organization", userId, org],
        });
      }
    },
  });
  const leave = async () =>
    saved.current ||
    (!attempt.current && !dirty.current) ||
    (await confirm({
      title: attempt.current ? m.challenge_leave() : m.directory_discard(),
      description: attempt.current
        ? m.challenge_uncertain()
        : m.directory_discard_description(),
      confirmLabel: attempt.current
        ? m.challenge_leave()
        : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (mutation.isPending || !(await leave())),
    enableBeforeUnload: !saved.current && (dirty.current || !!attempt.current),
  });
  return {
    mutation,
    denied:
      mutation.error instanceof DirectoryError &&
      ["forbidden", "not_found", "sign_in"].includes(mutation.error.code),
    frozen: mutation.isPending || !!attempt.current,
    uncertain: mutation.isError && !!attempt.current,
    close: async () => {
      if (!mutation.isPending && (await leave())) onClose();
    },
  };
}
export function ChallengeEditor({
  organization,
  userId,
  challenge: initialChallenge,
  onClose,
  onSaved,
}: {
  organization: Organization;
  userId: string;
  challenge?: Challenge | undefined;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  useLocale();
  const challenge = useRef(initialChallenge).current;
  const dirty = useRef(false),
    write = useWrite({
      path: `/api/organizations/${organization.id}/challenges${challenge ? "/" + challenge.id : ""}`,
      org: organization.id,
      userId,
      onClose,
      onSaved,
      dirty,
    });
  const [known, setKnown] = useState<Map<string, PointsOption>>(
    () =>
      new Map(
        (challenge?.groups ?? []).map((g) => [g.id, { ...g, createdAt: "" }]),
      ),
  );
  const form = useForm({
    defaultValues: {
      name: challenge?.name ?? "",
      description: challenge?.description ?? "",
      points: String(challenge?.points ?? 10),
      startsAt: challenge?.startsAt
        ? localTime(challenge.startsAt, organization.timezone)
        : "",
      endsAt: challenge?.endsAt
        ? localTime(challenge.endsAt, organization.timezone)
        : "",
      mode: challenge?.groups.length ? "groups" : "everyone",
      groups: challenge?.groups.map((g) => g.id) ?? [],
    },
    onSubmit: ({ value }) =>
      write.mutation.mutate({
        ...value,
        points: Number(value.points),
        groups: value.mode === "everyone" ? [] : value.groups,
        action: challenge ? "edit" : "create",
        ...(challenge ? { version: challenge.version } : {}),
      }),
  });
  dirty.current = useStore(form.store, (s) => s.isDirty);
  const values = useStore(form.store, (s) => s.values);
  if (write.denied) {
    dirty.current = false;
    return (
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{m.challenges_title()}</DialogTitle>
            <DialogDescription>{m.directory_forbidden()}</DialogDescription>
          </DialogHeader>
          <PointsError error={write.mutation.error} />
          <Button onClick={onClose}>{m.close()}</Button>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void write.close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {challenge ? m.challenge_edit() : m.challenge_create()}
          </DialogTitle>
          <DialogDescription>{m.challenge_draft_help()}</DialogDescription>
        </DialogHeader>
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <p>{m.activities_timezone({ timezone: organization.timezone })}</p>
          {(
            ["name", "description", "points", "startsAt", "endsAt"] as const
          ).map((name) => (
            <form.Field key={name} name={name}>
              {(field) => (
                <div>
                  <Label htmlFor={"challenge-" + name}>
                    {
                      {
                        name: m.challenge_name(),
                        description: m.challenge_description(),
                        points: m.challenge_points_amount(),
                        startsAt: m.challenge_starts(),
                        endsAt: m.challenge_ends(),
                      }[name]
                    }
                  </Label>
                  {name === "description" ? (
                    <Textarea
                      id={"challenge-" + name}
                      required
                      maxLength={2000}
                      disabled={write.frozen}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  ) : (
                    <Input
                      id={"challenge-" + name}
                      type={
                        name === "points"
                          ? "number"
                          : name.endsWith("At")
                            ? "datetime-local"
                            : "text"
                      }
                      min={name === "points" ? 1 : undefined}
                      max={name === "points" ? 10000 : undefined}
                      step={name === "points" ? 1 : undefined}
                      maxLength={name === "name" ? 80 : undefined}
                      minLength={name === "name" ? 2 : undefined}
                      required={name === "name" || name === "points"}
                      disabled={write.frozen}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </div>
              )}
            </form.Field>
          ))}
          <form.Field name="mode">
            {(field) => (
              <div>
                <Label htmlFor="challenge-audience">
                  {m.activities_audience()}
                </Label>
                <NativeSelect
                  id="challenge-audience"
                  value={field.state.value}
                  disabled={write.frozen}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  <NativeSelectOption value="everyone">
                    {m.activities_everyone()}
                  </NativeSelectOption>
                  <NativeSelectOption value="groups">
                    {m.directory_groups()}
                  </NativeSelectOption>
                </NativeSelect>
              </div>
            )}
          </form.Field>
          {values.mode === "groups" && (
            <>
              <p>
                {m.challenge_selected_groups({ count: values.groups.length })}
              </p>
              {values.groups.length > 0 && (
                <p>
                  {values.groups
                    .map((id) => known.get(id)?.name ?? id)
                    .join(", ")}
                </p>
              )}
              <PointsOptions
                path={`/api/organizations/${organization.id}/groups`}
                scope={[
                  "organization",
                  userId,
                  organization.id,
                  "challenge-groups",
                ]}
                multiple
                disabled={write.frozen}
                selected={
                  new Map(values.groups.map((id) => [id, known.get(id)!]))
                }
                onToggle={(item) => {
                  setKnown((k) => new Map(k).set(item.id, item));
                  form.setFieldValue(
                    "groups",
                    values.groups.includes(item.id)
                      ? values.groups.filter((id) => id !== item.id)
                      : [...values.groups, item.id],
                  );
                }}
              />
            </>
          )}
          {write.mutation.isError && (
            <PointsError error={write.mutation.error} />
          )}{" "}
          {write.uncertain && <p role="status">{m.challenge_uncertain()}</p>}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={write.mutation.isPending}
              onClick={() => void write.close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={write.mutation.isPending}
              disabled={values.mode === "groups" && !values.groups.length}
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
export type ChallengeAction =
  | "submit"
  | "withdraw"
  | "publish"
  | "archive"
  | "approve"
  | "reject"
  | "record";
export function ChallengeActionDialog({
  organization,
  userId,
  challenge: initialChallenge,
  submission: initialSubmission,
  action,
  onClose,
  onSaved,
}: {
  organization: Organization;
  userId: string;
  challenge: Challenge;
  submission?: Submission | null | undefined;
  action: ChallengeAction;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  useLocale();
  const challenge = useRef(initialChallenge).current,
    submission = useRef(initialSubmission).current;
  const self = organization.role === "participant",
    dirty = useRef(false),
    confirm = useConfirmation(),
    base = `/api/organizations/${organization.id}/${self ? "me/" : ""}challenges/${challenge.id}`,
    review = ["approve", "reject", "record"].includes(action);
  const path = review
    ? base + "/submissions" + (action === "record" ? "" : "/" + submission!.id)
    : base;
  const write = useWrite({
    path,
    org: organization.id,
    userId,
    onClose,
    onSaved,
    dirty,
  });
  const form = useForm({
    defaultValues: { note: "", person: null as Candidate | null },
    onSubmit: async ({ value }) => {
      if (
        action !== "submit" &&
        !write.uncertain &&
        !(await confirm({
          title: label(),
          description:
            action === "publish"
              ? m.challenge_publish_help()
              : action === "archive"
                ? m.challenge_archive_help()
                : action === "withdraw"
                  ? m.challenge_withdraw_help()
                  : m.challenge_review_confirm({
                      points: submission?.points ?? challenge.points,
                      person:
                        submission?.personName ?? value.person?.name ?? "",
                    }),
          confirmLabel: label(),
          destructive: ["archive", "withdraw", "reject"].includes(action),
        }))
      )
        return;
      const body =
        action === "submit"
          ? {
              action,
              note: value.note,
              version: challenge.submission?.version ?? null,
              challengeVersion: challenge.version,
            }
          : action === "record"
            ? {
                action,
                personId: value.person?.id,
                version: value.person?.submissionVersion ?? null,
                challengeVersion: challenge.version,
                feedback: value.note,
              }
            : review
              ? { action, version: submission!.version, feedback: value.note }
              : {
                  action,
                  version:
                    action === "withdraw"
                      ? challenge.submission!.version
                      : challenge.version,
                };
      write.mutation.mutate(body);
    },
  });
  dirty.current = useStore(form.store, (s) => s.isDirty);
  const person = useStore(form.store, (s) => s.values.person),
    label = () =>
      ({
        submit: m.challenge_submit(),
        withdraw: m.challenge_withdraw(),
        publish: m.challenge_publish(),
        archive: m.challenge_archive(),
        approve: m.challenge_approve(),
        reject: m.challenge_reject(),
        record: m.challenge_record(),
      })[action];
  if (write.denied) {
    dirty.current = false;
    return (
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{m.challenges_title()}</DialogTitle>
            <DialogDescription>{m.directory_forbidden()}</DialogDescription>
          </DialogHeader>
          <PointsError error={write.mutation.error} />
          <Button onClick={onClose}>{m.close()}</Button>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void write.close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{label()}</DialogTitle>
          <DialogDescription>
            {action === "submit"
              ? m.challenge_submit_help()
              : review
                ? m.challenge_feedback_help()
                : action === "publish"
                  ? m.challenge_publish_help()
                  : action === "archive"
                    ? m.challenge_archive_help()
                    : m.challenge_withdraw_help()}
          </DialogDescription>
        </DialogHeader>
        <p>
          <strong>{challenge.name}</strong> ·{" "}
          {m.rewards_points({
            amount: String(submission?.points ?? challenge.points),
          })}
        </p>
        {submission?.personName && <p>{submission.personName}</p>}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {action === "record" && (
            <>
              <Label>{m.challenge_recipient()}</Label>
              {person && <p>{person.name}</p>}
              <PointsOptions
                path={base + "/candidates"}
                scope={[
                  "organization",
                  userId,
                  organization.id,
                  "challenge-candidates",
                  challenge.id,
                ]}
                disabled={write.frozen}
                selected={new Map(person ? [[person.id, person]] : [])}
                onToggle={(item) =>
                  form.setFieldValue("person", item as Candidate)
                }
              />
            </>
          )}
          {(review || action === "submit") && (
            <form.Field name="note">
              {(field) => (
                <div>
                  <Label htmlFor="challenge-note">
                    {action === "submit"
                      ? m.challenge_note()
                      : m.challenge_feedback()}
                  </Label>
                  <Textarea
                    id="challenge-note"
                    maxLength={action === "submit" ? 500 : 300}
                    required={action === "reject" || action === "record"}
                    disabled={write.frozen}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          )}
          {write.mutation.isError && (
            <PointsError error={write.mutation.error} />
          )}{" "}
          {write.uncertain && <p role="status">{m.challenge_uncertain()}</p>}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={write.mutation.isPending}
              onClick={() => void write.close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={write.mutation.isPending}
              disabled={action === "record" && !person}
            >
              <Send aria-hidden="true" />
              {write.uncertain ? m.try_again() : label()}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
