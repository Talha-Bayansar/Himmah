import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Mail,
} from "lucide-react";
import { DirectoryError, directoryRequest } from "../community/client";
import type { Page } from "../community/contracts";
import {
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import {
  CollectionCount,
  ViewAll,
  PREVIEW_SIZE,
  type ContactFilters,
} from "../modules/people/collections";
import { ErrorNotice, useSearch } from "../modules/people/shared";
import type { Contact } from "../modules/people/contracts";
import { useLocale } from "../localization/locale";
import { m } from "../paraglide/messages.js";
import type { ContactLearningEntry } from "./contracts";

export function ContactLearning({
  org,
  user,
  contact,
  full,
  filters,
  onFiltersChange,
}: {
  org: string;
  user: string;
  contact: Contact;
  full: boolean;
  filters: ContactFilters | undefined;
  onFiltersChange: ((next: ContactFilters) => void) | undefined;
}) {
  const locale = useLocale()?.locale ?? "en",
    q = useSearch(full ? (filters?.q ?? "") : "");
  const query = useInfiniteQuery({
    queryKey: [
      "people",
      user,
      org,
      "learning",
      contact.id,
      full ? "full" : "preview",
      q,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await directoryRequest<
          Page<ContactLearningEntry> & { total: number }
        >(
          `/api/organizations/${org}/learning/contacts/${contact.id}?limit=${full ? 25 : PREVIEW_SIZE}&q=${encodeURIComponent(q)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
          { signal },
        );
      } catch (e) {
        // Use the People scope-loss path to hide stale profile data and clear its private caches.
        if (
          e instanceof DirectoryError &&
          ["forbidden", "not_found"].includes(e.code)
        )
          throw new DirectoryError("not_found_or_forbidden");
        throw e;
      }
    },
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  });
  const denied =
    query.isError &&
    query.error instanceof DirectoryError &&
    ["not_found_or_forbidden", "sign_in", "verify_required"].includes(
      query.error.code,
    );
  if (denied) return <ErrorNotice error={query.error} />;
  const seen = new Set<string>();
  const items = (query.data?.pages.flatMap((p) => p.items) ?? [])
    .filter((row) => !seen.has(row.id) && !!seen.add(row.id))
    .slice(0, full ? undefined : PREVIEW_SIZE);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(value),
    );
  return (
    <section
      className="contact-learning space-y-3"
      aria-label={m.learn_contact_history()}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        {!full && (
          <h2 className="text-xl font-semibold">{m.learn_contact_history()}</h2>
        )}
        <CollectionCount total={query.data?.pages[0]?.total} compact={!full} />
      </div>
      {full && (
        <DirectoryToolbar
          id="contact-learning-search"
          label={m.learn_contact_search()}
          value={filters?.q ?? ""}
          onChange={(q) => onFiltersChange?.({ q, history: false })}
        />
      )}
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && !query.data ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {!items.length && (
            <p className="directory-empty">
              {q ? m.learn_contact_no_matches() : m.learn_contact_empty()}
            </p>
          )}
          <DirectoryList
            label={m.learn_contact_history()}
            busy={query.isFetchingNextPage}
          >
            {items.map((row) => {
              const Icon =
                row.status === "submitted"
                  ? CheckCircle2
                  : row.status === "started"
                    ? Clock3
                    : Mail;
              return (
                <DirectoryItem key={row.id} linked>
                  <Link
                    className="directory-item-link"
                    to="/workspace/$organizationId/learning/$learningId"
                    params={{ organizationId: org, learningId: row.learningId }}
                    search={{
                      publication: row.publicationId,
                      recipient: row.id,
                      tab: row.submittedAt ? "results" : "participants",
                      q: "",
                      activity: "",
                      session: "",
                    }}
                  >
                    <span className="contact-learning-icon" aria-hidden="true">
                      <BookOpen size={20} />
                    </span>
                    <span className="contact-learning-copy">
                      <strong>{row.title}</strong>
                      <span className="contact-learning-status">
                        <Icon size={15} aria-hidden="true" />
                        <span>
                          {row.status === "submitted"
                            ? m.learn_submitted()
                            : row.status === "started"
                              ? m.learn_started()
                              : m.learn_invited()}
                          {row.revoked && <> · {m.learn_contact_revoked()}</>}
                        </span>
                      </span>
                      {row.submittedAt && row.score !== null && (
                        <span>
                          {m.learn_contact_last_result({
                            score: String(row.score),
                            total: String(row.questionCount),
                            attempt: String(row.submittedSequence),
                          })}
                        </span>
                      )}
                      <span>
                        {m.learn_version_number({
                          number: String(row.publicationNumber),
                        })}
                        {" · "}
                        {row.submittedAt
                          ? date(row.submittedAt)
                          : m.learn_contact_assigned({
                              date: date(row.createdAt),
                            })}
                      </span>
                      {row.submittedAt && !row.released && (
                        <span>{m.learn_contact_held()}</span>
                      )}
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </DirectoryItem>
              );
            })}
          </DirectoryList>
          {full ? (
            <>
              <InfiniteFooter {...query} />
              {query.isError && !query.isFetchNextPageError && (
                <ErrorNotice
                  error={query.error}
                  retry={() => void query.refetch()}
                />
              )}
            </>
          ) : (
            <>
              {query.isError && (
                <ErrorNotice
                  error={query.error}
                  retry={() => void query.refetch()}
                />
              )}
              <ViewAll org={org} id={contact.id} view="learning" />
            </>
          )}
        </>
      )}
      {full && (
        <details className="session-help">
          <summary>{m.learn_contact_about()}</summary>
          <p>{m.learn_contact_identity_note()}</p>
        </details>
      )}
    </section>
  );
}
