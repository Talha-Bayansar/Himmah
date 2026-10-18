import { ListSkeleton } from "../components/shared/infinite-list";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "../components/ui/alert";
import { ActionButton } from "../components/shared/action-button";
import { directoryRequest, directoryMessage } from "./client";
import { m } from "../paraglide/messages.js";
import { useLocale } from "../localization/locale";
export default function AcceptInvite({
  token,
  userId,
}: {
  token: string;
  userId: string;
}) {
  useLocale();
  const client = useQueryClient();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["organization", userId, "invitation-preview", token],
    queryFn: ({ signal }) =>
      directoryRequest<{
        organization: { name: string; role: "owner" | "admin" | "volunteer" };
      }>("/api/invitations/preview", {
        method: "POST",
        signal,
        body: JSON.stringify({ token }),
      }),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      directoryRequest<{ organizationId: string }>("/api/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: async () => {
      client.removeQueries({
        queryKey: ["organization", userId, "invitation-preview", token],
      });
      await client.invalidateQueries({ queryKey: ["organizations"] });
      await navigate({ to: "/start", replace: true, hash: "" });
    },
  });
  return (
    <div className="space-y-5">
      <h1>{m.directory_join_title()}</h1>
      <p>{m.directory_join_help()}</p>
      {accept.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{directoryMessage(accept.error)}</AlertDescription>
        </Alert>
      )}
      {preview.isPending ? (
        <ListSkeleton />
      ) : preview.isError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{directoryMessage(preview.error)}</AlertDescription>
        </Alert>
      ) : (
        <>
          <h2>{preview.data.organization.name}</h2>
          <p>
            {m.your_role()}: {m[`role_${preview.data.organization.role}`]()}
          </p>
        </>
      )}
      {preview.data && (
        <ActionButton
          pending={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {m.directory_join()}
        </ActionButton>
      )}
    </div>
  );
}
