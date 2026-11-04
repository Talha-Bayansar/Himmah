import { ArrowLeft } from "lucide-react";
import { useConfirmation } from "../components/shared/confirmation";
import { useState } from "react";
import { useBlocker, Link } from "@tanstack/react-router";
import {
  DirectoryHeader,
  DirectoryToolbar,
  DirectoryList,
  DirectoryItem,
  DirectoryRecord,
} from "../components/shared/directory-layout";
import {
  InfiniteFooter,
  ListSkeleton,
} from "../components/shared/infinite-list";
import { ActionButton } from "../components/shared/action-button";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import { ErrorNotice } from "../activities/Activities";
import { m } from "../paraglide/messages.js";
import { secretToken, type LearningDetail } from "./contracts";
import {
  CommandError,
  CopyLink,
  useLearning,
  useLearningCommand,
  useLearningPages,
} from "./shared";
import type { LearningOption } from "./LearningPicker";
export default function LearningAssign({ detail }: { detail: LearningDetail }) {
  const { base, org } = useLearning(),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<Map<string, LearningOption>>(new Map()),
    [links, setLinks] = useState<{ name: string; url: string }[]>([]);
  const command = useLearningCommand(detail.item.id),
    query = useLearningPages<LearningOption>(
      `${base}/options?kind=contacts&q=${encodeURIComponent(q)}`,
    );
  const locked = command.isPending || command.uncertain;
  const confirm = useConfirmation();
  useBlocker({
    shouldBlockFn: async () =>
      command.isPending ||
      (((selected.size > 0 && !command.isSuccess) || command.uncertain) &&
        !(await confirm({
          title: m.directory_discard(),
          description: command.uncertain
            ? m.learn_uncertain()
            : m.directory_discard_description(),
          destructive: true,
          confirmLabel: m.directory_discard(),
        }))),
    enableBeforeUnload: () =>
      command.isPending ||
      command.uncertain ||
      (selected.size > 0 && !command.isSuccess),
  });
  const generate = async () => {
    const recipients = [...selected.values()].map((v) => ({
      ...v,
      token: secretToken(),
    }));
    setLinks(
      recipients.map((v) => ({
        name: v.name,
        url: `${location.origin}/learn/${detail.item.id}#${v.token}`,
      })),
    );
    try {
      await command.run({
        action: "assign",
        version: detail.item.version,
        publication: detail.publication?.id,
        recipients: recipients.map((v) => ({ contact: v.id, token: v.token })),
      });
    } catch {}
  };
  return (
    <section className="directory form-page">
      <Button asChild variant="link" className="settings-back">
        <Link
          to="/workspace/$organizationId/learning/$learningId"
          params={{ organizationId: org.id, learningId: detail.item.id }}
          search={{
            publication: "",
            tab: "participants",
            q: "",
            activity: "",
            session: "",
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {m.form_back()}
        </Link>
      </Button>
      <DirectoryHeader
        title={m.learn_assign()}
        description={detail.item.title}
        autoFocus={false}
      />
      <p className="activity-note">{m.learn_assignment_warning()}</p>
      {command.isSuccess ? (
        <div className="learning-fields">
          <p role="status">{m.learn_links_ready()}</p>
          {links.map((v, i) => (
            <div key={i}>
              <h2>{v.name}</h2>
              <CopyLink value={v.url} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <DirectoryToolbar
            id="learning-contact-search"
            value={q}
            onChange={setQ}
            label={m.directory_search()}
          />
          <p role="status">
            {m.learn_selected({ count: String(selected.size) })}
          </p>
          {selected.size > 0 && (
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => setSelected(new Map())}
            >
              {m.learn_clear_selection()}
            </Button>
          )}
          {query.isPending ? (
            <ListSkeleton />
          ) : query.isError ? (
            <ErrorNotice
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <>
              <DirectoryList label={m.learn_assign()}>
                {query.items.map((v) => (
                  <DirectoryItem key={v.id}>
                    <label
                      className="choice-row"
                      data-selected={selected.has(v.id)}
                      data-disabled={
                        locked || (!selected.has(v.id) && selected.size >= 50)
                      }
                    >
                      <Checkbox
                        checked={selected.has(v.id)}
                        disabled={
                          locked || (!selected.has(v.id) && selected.size >= 50)
                        }
                        onCheckedChange={(checked) => {
                          const next = new Map(selected);
                          if (checked) next.set(v.id, v);
                          else next.delete(v.id);
                          setSelected(next);
                        }}
                        aria-label={v.name}
                      />
                      <DirectoryRecord name={v.name} />
                    </label>
                  </DirectoryItem>
                ))}
              </DirectoryList>
              {!query.items.length && (
                <p className="directory-empty">{m.directory_no_matches()}</p>
              )}
              <InfiniteFooter {...query} />
            </>
          )}
          <div className="directory-actions">
            <ActionButton
              pending={command.isPending}
              disabled={
                locked ||
                !selected.size ||
                detail.publication?.content.mode !== "assigned"
              }
              onClick={() => void generate()}
            >
              {m.learn_generate_count({ count: String(selected.size) })}
            </ActionButton>
          </div>
        </>
      )}
      <CommandError command={command} />
    </section>
  );
}
