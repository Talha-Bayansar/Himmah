import { Button } from "../components/ui/button";
import { useState } from "react";
import {
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { FormSurface } from "../components/shared/form-surface";
import { ErrorNotice } from "../activities/Activities";
import { SelectionOption } from "../components/shared/selection-option";
import { m } from "../paraglide/messages.js";
import { useLearning, useLearningPages } from "./shared";
import { useLocale } from "../localization/locale";
export type LearningOption = {
  id: string;
  name: string;
  activityId?: string;
  startsAt?: string;
  createdAt: string;
};
export default function LearningPicker({
  kind,
  selected = "",
  onSelect,
  onClose,
}: {
  kind: "activities" | "sessions";
  selected?: string;
  onSelect: (v: LearningOption) => void;
  onClose: () => void;
}) {
  const { base, org } = useLearning(),
    [q, setQ] = useState(""),
    locale = useLocale()?.locale ?? "en";
  const query = useLearningPages<LearningOption>(
    `${base}/options?kind=${kind}&q=${encodeURIComponent(q)}`,
  );
  return (
    <FormSurface
      title={kind === "activities" ? m.insights_activity() : m.sessions_title()}
      description={m.learn_optional_context()}
      onClose={onClose}
    >
      <DirectoryToolbar
        id="learning-option-search"
        value={q}
        onChange={setQ}
        label={m.directory_search()}
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <DirectoryList label={m.learn_optional_context()}>
            {query.items.map((item) => (
              <DirectoryItem key={item.id}>
                <SelectionOption
                  selected={selected === item.id}
                  onSelect={() => onSelect(item)}
                  description={
                    item.startsAt
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: org.timezone,
                        }).format(new Date(item.startsAt))
                      : undefined
                  }
                >
                  {item.name}
                </SelectionOption>
              </DirectoryItem>
            ))}
          </DirectoryList>
          {!query.items.length && (
            <p className="directory-empty">{m.directory_no_matches()}</p>
          )}
          <InfiniteFooter {...query} />
        </>
      )}

      <div className="selection-dismiss">
        <Button type="button" variant="outline" onClick={onClose}>
          {m.cancel()}
        </Button>
      </div>
    </FormSurface>
  );
}
