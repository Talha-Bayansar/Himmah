import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Mail, Unlink, X } from "lucide-react";
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
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { directoryRequest, DirectoryError } from "../community/client";
import { newToken } from "../community/contracts";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
export function ParticipantEditor({
  path,
  personName,
  linkId,
  onClose,
  onSaved,
}: {
  path: string;
  personName: string;
  linkId?: string;
  onClose: () => void;
  onSaved: (link?: string) => Promise<void>;
}) {
  useLocale();
  const confirm = useConfirmation(),
    attempt = useRef<Record<string, unknown> | null>(null),
    saved = useRef(false),
    token = useRef(""),
    key = useRef("");
  const title = linkId ? m.participant_disconnect() : m.participant_invite();
  const form = useForm({
    defaultValues: { email: "", consent: false, reason: "" },
    onSubmit: async ({ value }) => {
      if (!attempt.current) {
        if (linkId) {
          if (
            !(await confirm({
              title,
              description: m.participant_disconnect_help(),
              confirmLabel: title,
              destructive: true,
            }))
          )
            return;
          attempt.current = { reason: value.reason.trim() };
        } else {
          if (!value.consent) return;
          token.current ||= newToken();
          key.current ||= crypto.randomUUID();
          attempt.current = {
            email: value.email.trim(),
            consent: true,
            key: key.current,
            token: token.current,
          };
        }
      }
      await submit.mutateAsync(attempt.current).catch(() => {});
    },
  });
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      directoryRequest(path + (linkId ? "/links/" + linkId : "/invitations"), {
        method: linkId ? "DELETE" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      saved.current = true;
      await onSaved(
        linkId
          ? undefined
          : window.location.origin + "/participate#" + token.current,
      );
    },
    onError: (error) => {
      if (
        error instanceof DirectoryError &&
        !["service", "rate_limit"].includes(error.code)
      )
        attempt.current = null;
    },
  });
  const dirty = useStore(form.store, (s) => s.isDirty),
    consent = useStore(form.store, (s) => s.values.consent),
    frozen = submit.isPending || !!attempt.current;
  const leave = async () =>
    saved.current ||
    (!dirty && !attempt.current) ||
    (await confirm({
      title: attempt.current ? m.participant_leave() : m.directory_discard(),
      description: attempt.current
        ? m.participant_leave_help()
        : m.directory_discard_description(),
      confirmLabel: attempt.current
        ? m.participant_leave()
        : m.directory_discard(),
      destructive: true,
    }));
  useBlocker({
    shouldBlockFn: async () =>
      !saved.current && (submit.isPending || !(await leave())),
    enableBeforeUnload: !saved.current && (dirty || !!attempt.current),
  });
  const close = async () => {
    if (!submit.isPending && (await leave())) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {linkId
              ? m.participant_disconnect_help()
              : m.participant_invite_help()}
          </DialogDescription>
        </DialogHeader>
        <strong>{personName}</strong>
        {submit.isError && <PointsError error={submit.error} />}{" "}
        {submit.isError && attempt.current && (
          <p role="status">{m.participant_leave_help()}</p>
        )}
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {linkId ? (
            <form.Field name="reason">
              {(field) => (
                <div>
                  <Label htmlFor="participant-reason">
                    {m.participant_disconnect_reason()}
                  </Label>
                  <Textarea
                    id="participant-reason"
                    required
                    minLength={1}
                    maxLength={300}
                    value={field.state.value}
                    disabled={frozen}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </form.Field>
          ) : (
            <>
              <form.Field name="email">
                {(field) => (
                  <div>
                    <Label htmlFor="participant-email">
                      {m.email_address()}
                    </Label>
                    <Input
                      id="participant-email"
                      type="email"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      value={field.state.value}
                      disabled={frozen}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="consent">
                {(field) => (
                  <div>
                    <Label className="directory-check">
                      <Checkbox
                        checked={field.state.value}
                        disabled={frozen}
                        onCheckedChange={(v) => field.handleChange(v === true)}
                      />
                      <span>{m.participant_consent()}</span>
                    </Label>
                  </div>
                )}
              </form.Field>
            </>
          )}
          <div className="directory-actions">
            <Button
              type="button"
              variant="outline"
              disabled={submit.isPending}
              onClick={() => void close()}
            >
              <X aria-hidden="true" />
              {m.cancel()}
            </Button>
            <ActionButton
              type="submit"
              pending={submit.isPending}
              disabled={!linkId && !consent}
              variant={linkId ? "destructive" : "default"}
            >
              {linkId ? (
                <Unlink aria-hidden="true" />
              ) : (
                <Mail aria-hidden="true" />
              )}
              {submit.isError && attempt.current ? m.try_again() : title}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
