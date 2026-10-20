import { useRef } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { LockKeyhole, X, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { ActionButton } from "../components/shared/action-button";
import { useConfirmation } from "../components/shared/confirmation";
import { PointsError } from "../points/PointsShared";
import { m } from "../paraglide/messages.js";
import type { FutsalSeason, FutsalEntry } from "./contracts";
import { useFutsalWrite } from "./client";
export function SeasonAction({
  userId,
  organizationId,
  season: initial,
  action,
  entry,
  onClose,
}: {
  userId: string;
  organizationId: string;
  season: FutsalSeason;
  action: "prepare" | "cancel" | "remove";
  entry?: FutsalEntry;
  onClose: () => void;
}) {
  const season = useRef(initial).current,
    dirty = useRef(false),
    confirm = useConfirmation();
  const title =
      action === "prepare"
        ? m.futsal_lock()
        : action === "cancel"
          ? m.futsal_cancel()
          : m.futsal_remove(),
    help =
      action === "prepare"
        ? m.futsal_lock_help()
        : action === "cancel"
          ? m.futsal_cancel_help()
          : m.futsal_remove_help();
  const write = useFutsalWrite({
    path: `/api/organizations/${organizationId}/futsal/seasons/${season.id}/${action === "remove" ? "entries/" + entry!.id : action}`,
    method: action === "remove" ? "DELETE" : "POST",
    userId,
    organizationId,
    dirty,
    onSaved: onClose,
    onClose,
  });
  const form = useForm({
    defaultValues: { reason: "" },
    onSubmit: async ({ value }) => {
      if (
        !write.uncertain &&
        !(await confirm({
          title,
          description: help,
          confirmLabel: title,
          destructive: action !== "prepare",
        }))
      )
        return;
      write.mutation.mutate({
        version: season.version,
        ...(action === "cancel" ? { reason: value.reason } : {}),
      });
    },
  });
  dirty.current = useStore(form.store, (s) => s.isDirty);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) void write.close();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{help}</DialogDescription>
        </DialogHeader>
        <form
          className="directory-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <p>
            <strong>{entry?.name ?? season.name}</strong>
          </p>
          {action === "cancel" && (
            <form.Field name="reason">
              {(field) => (
                <div>
                  <Label htmlFor="season-cancel-reason">
                    {m.futsal_reason()}
                  </Label>
                  <Textarea
                    id="season-cancel-reason"
                    required
                    maxLength={300}
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
          )}
          {write.uncertain && <p>{m.futsal_uncertain()}</p>}
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
              variant={action === "prepare" ? "default" : "destructive"}
              pending={write.mutation.isPending}
            >
              {action === "prepare" ? (
                <LockKeyhole aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {write.uncertain ? m.try_again() : title}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
