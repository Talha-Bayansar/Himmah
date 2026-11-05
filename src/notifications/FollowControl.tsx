import { minuteTime } from "../organization/settings-contracts";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing } from "lucide-react";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
import {
  directoryRequest,
  DirectoryError,
  directoryMessage,
} from "../community/client";
import type { FollowCommand, FollowState } from "./follow-contracts";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { PeopleForm } from "../modules/people/shared";
import { ErrorFeedback } from "../components/shared/feedback";
import { ActionButton } from "../components/shared/action-button";

export function FollowControl({
  user,
  org,
  activity,
  session,
}: {
  user: string;
  org: string;
  activity: string;
  session?: string;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const base = `/api/organizations/${org}/activities/${activity}${session ? "/sessions/" + session : ""}/follow`,
    key = [
      "organization",
      user,
      org,
      "session-follows",
      activity,
      session ?? "activity",
    ];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => directoryRequest<FollowState>(base, { signal }),
    retry: false,
  });
  if (query.isError)
    return (
      <ErrorFeedback
        message={directoryMessage(query.error, m.interface_load_error())}
        retry={() => query.refetch()}
        pending={query.isFetching}
      />
    );
  return (
    <div className="follow-control">
      <Button
        variant="outline"
        size="sm"
        disabled={query.isPending}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {query.data?.following ? (
          <BellRing aria-hidden="true" />
        ) : (
          <Bell aria-hidden="true" />
        )}
        {query.data?.following ? m.follow_following() : m.follow_settings()}
      </Button>
      {open && query.data && (
        <FollowEditor
          initial={query.data}
          user={user}
          org={org}
          base={base}
          session={!!session}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function FollowEditor({
  initial,
  user,
  org,
  base,
  session,
  onClose,
}: {
  initial: FollowState;
  user: string;
  org: string;
  base: string;
  session: boolean;
  onClose: () => void;
}) {
  const cache = useQueryClient(),
    [following, setFollowing] = useState(initial.following),
    [minutes, setMinutes] = useState<0 | 60>(initial.reminderMinutes),
    [version, setVersion] = useState(initial.version),
    [canFollow, setCanFollow] = useState(initial.canFollow),
    [refreshing, setRefreshing] = useState(false),
    [notice, setNotice] = useState("");
  const attempt = useRef<FollowCommand | null>(null),
    committed = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: FollowCommand) =>
      directoryRequest<FollowState>(base, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      committed.current = true;
      await cache.invalidateQueries({
        queryKey: ["organization", user, org, "session-follows"],
      });
      await cache.invalidateQueries({ queryKey: ["notifications", user, org] });
      onClose();
    },
  });
  const code =
    mutation.error instanceof DirectoryError ? mutation.error.code : null;
  const known =
    code !== null &&
    [
      "not_found",
      "forbidden",
      "sign_in",
      "verify_required",
      "invalid_input",
      "version_conflict",
      "request_key_conflict",
      "follow_closed",
    ].includes(code);
  const uncertain = mutation.isError && !known;
  const conflict =
    code === "version_conflict" || code === "request_key_conflict";
  const save = () => {
    if (conflict) return;
    const body =
      uncertain && attempt.current
        ? attempt.current
        : {
            key: crypto.randomUUID(),
            following,
            reminderMinutes: minutes,
            version,
          };
    attempt.current = body;
    mutation.mutate(body);
  };
  return (
    <PeopleForm
      title={session ? m.follow_session() : m.follow_activity()}
      description={session ? m.follow_session_help() : m.follow_activity_help()}
      onClose={onClose}
      pending={mutation.isPending || refreshing}
      onSubmit={save}
      dirty={() =>
        uncertain ||
        following !== initial.following ||
        minutes !== initial.reminderMinutes
      }
      canLeave={() => committed.current}
      submitLabel={uncertain ? m.try_again() : m.directory_save()}
      submitDisabled={conflict || (!canFollow && following)}
    >
      {initial.source === "activity" && (
        <p className="activity-note">{m.follow_inherited()}</p>
      )}
      <fieldset
        className="form-fields"
        disabled={uncertain || refreshing || conflict}
      >
        <Label className="directory-check">
          <Checkbox
            checked={following}
            onCheckedChange={(value) => setFollowing(value === true)}
            disabled={!canFollow && !following}
          />
          {session ? m.follow_optin_session() : m.follow_optin_activity()}
        </Label>
        <div className="learning-field">
          <Label htmlFor="follow-reminder">{m.follow_reminder()}</Label>
          <NativeSelect
            id="follow-reminder"
            value={String(minutes)}
            disabled={!following || !canFollow}
            onChange={(event) =>
              setMinutes(Number(event.target.value) as 0 | 60)
            }
          >
            <NativeSelectOption value="60">
              {m.follow_hour()}
            </NativeSelectOption>
            <NativeSelectOption value="0">
              {m.follow_changes_only()}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </fieldset>
      <p className="activity-note">
        {initial.quietHours?.enabled === false
          ? m.org_settings_no_quiet()
          : m.org_settings_follow_quiet({
              start: minuteTime(initial.quietHours?.start ?? 1320),
              end: minuteTime(initial.quietHours?.end ?? 480),
            })}
      </p>
      {!canFollow && <p className="activity-note">{m.follow_closed()}</p>}
      {mutation.isError && (
        <ErrorFeedback
          message={
            code === "follow_closed"
              ? m.follow_closed()
              : conflict
                ? m.follow_conflict()
                : directoryMessage(mutation.error, m.interface_save_error())
          }
        />
      )}
      {conflict && (
        <ActionButton
          type="button"
          variant="outline"
          pending={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              const current = await directoryRequest<FollowState>(base);
              setVersion(current.version);
              setCanFollow(current.canFollow);
              attempt.current = null;
              mutation.reset();
              setNotice(m.follow_review());
            } catch {
              /* Keep draft and original error; retry remains available. */
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {m.follow_refresh()}
        </ActionButton>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="activity-note">{m.follow_device_help()}</p>
    </PeopleForm>
  );
}
