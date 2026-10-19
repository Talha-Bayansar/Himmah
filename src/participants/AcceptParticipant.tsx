import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Link2, LogOut } from "lucide-react";
import { ListSkeleton } from "../components/shared/infinite-list";
import { ActionButton } from "../components/shared/action-button";
import { directoryRequest } from "../community/client";
import { PointsError } from "../points/PointsShared";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
export default function AcceptParticipant({
  token,
  userId,
  onSignOut,
  pending,
}: {
  token: string;
  userId: string;
  onSignOut: () => void;
  pending: boolean;
}) {
  useLocale();
  const client = useQueryClient(),
    navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["organization", userId, "participant-invitation", token],
    queryFn: ({ signal }) =>
      directoryRequest<{
        item: { organizationName: string; personName: string };
      }>("/api/participant-invitations/preview", {
        method: "POST",
        signal,
        body: JSON.stringify({ token }),
      }),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      directoryRequest<{ organizationId: string }>(
        "/api/participant-invitations/accept",
        { method: "POST", body: JSON.stringify({ token }) },
      ),
    onSuccess: async (value) => {
      await client.cancelQueries({ queryKey: ["organization", userId] });
      client.removeQueries({ queryKey: ["organization", userId] });
      await client.invalidateQueries({ queryKey: ["organizations", userId] });
      await navigate({
        to: "/workspace/$organizationId/$section",
        params: { organizationId: value.organizationId, section: "me" },
        replace: true,
        hash: "",
      });
    },
  });
  return (
    <section className="directory">
      <h1 tabIndex={-1} data-page-heading>
        {m.participant_join_title()}
      </h1>
      <p className="onboarding-intro">{m.participant_join_help()}</p>
      {preview.isPending ? (
        <ListSkeleton />
      ) : preview.isError ? (
        <PointsError
          error={preview.error}
          pending={preview.isFetching}
          retry={() => void preview.refetch()}
        />
      ) : (
        <div className="settings-panel">
          <h2>{preview.data.item.organizationName}</h2>
          <p>{preview.data.item.personName}</p>
          <ActionButton
            pending={accept.isPending}
            onClick={() => accept.mutate()}
          >
            <Link2 aria-hidden="true" />
            {m.participant_connect()}
          </ActionButton>
        </div>
      )}
      {accept.isError && <PointsError error={accept.error} />}
      <ActionButton
        variant="outline"
        pending={pending}
        disabled={accept.isPending}
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" />
        {m.participant_other_account()}
      </ActionButton>
    </section>
  );
}
