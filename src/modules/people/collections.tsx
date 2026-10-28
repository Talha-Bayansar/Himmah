import { Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { m } from "../../paraglide/messages.js";
import { Button } from "../../components/ui/button";
export const PREVIEW_SIZE = 3;
export const contactViews = [
  "methods",
  "groups",
  "relationships",
  "history",
  "communication",
] as const;
export type ContactView = (typeof contactViews)[number];
export type ContactFilters = { q: string; history: boolean };
export const collectionTitle = (view: ContactView) =>
  ({
    methods: m.people_methods,
    groups: m.people_groups,
    relationships: m.people_relationships,
    history: m.people_history,
    communication: m.people_communication,
  })[view]();
export function CollectionCount({
  total,
  compact = false,
}: {
  total: number | undefined;
  compact?: boolean;
}) {
  if (total === undefined) return null;
  return compact ? (
    <span
      aria-label={m.people_collection_total({ count: total })}
      className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      {total}
    </span>
  ) : (
    <span className="text-sm font-normal text-muted-foreground">
      {m.people_collection_total({ count: total })}
    </span>
  );
}
export function ViewAll({
  org,
  id,
  view,
}: {
  org: string;
  id: string;
  view: ContactView;
}) {
  const label = {
    methods: m.people_view_all_methods,
    groups: m.people_view_all_groups,
    relationships: m.people_view_all_relationships,
    history: m.people_view_all_history,
    communication: m.people_view_all_communication,
  }[view]();
  return (
    <Button variant="link" className="px-0" asChild>
      <Link
        to="/workspace/$organizationId/people/contacts/$contactId/$view"
        params={{ organizationId: org, contactId: id, view }}
        search={{ q: "", history: false }}
      >
        {label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function contactFilters(input: Record<string, unknown>): ContactFilters {
  const q = input.q ?? "",
    history = input.history ?? false;
  if (
    typeof q !== "string" ||
    q.length > 80 ||
    ![true, false, "true", "false"].includes(history as boolean)
  )
    throw notFound();
  return { q, history: history === true || history === "true" };
}
