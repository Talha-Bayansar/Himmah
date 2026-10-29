import { Search } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import { getLocale } from "../../paraglide/runtime.js";

/** Shared directory pattern; see docs/DESIGN_SYSTEM.md for its visual contract. */
export function DirectoryHeader({
  title,
  description,
  action,
  autoFocus = true,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  autoFocus?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) heading.current?.focus({ preventScroll: true });
  }, [title, autoFocus]);
  return (
    <div className="directory-heading">
      <div>
        <h1 ref={heading} tabIndex={-1} data-page-heading>
          {title}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function DirectoryToolbar({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="directory-toolbar">
      <label htmlFor={id}>
        <Search aria-hidden="true" size={17} />
        <span className="sr-only">{label}</span>
        <Input
          id={id}
          type="search"
          maxLength={80}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
        />
      </label>
      {children}
    </div>
  );
}
export function DirectoryList({
  label,
  children,
  busy = false,
}: {
  label: string;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <ul className="directory-list" aria-label={label} aria-busy={busy}>
      {children}
    </ul>
  );
}
export function DirectoryItem({
  children,
  linked = false,
}: {
  children: ReactNode;
  linked?: boolean;
}) {
  return (
    <li className={cn("directory-item", linked && "directory-item-linked")}>
      {children}
    </li>
  );
}
export function DirectoryRecord({
  name,
  detail,
  icon,
}: {
  name: string;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="directory-record">
      <span className="avatar" aria-hidden="true">
        {icon ?? [...name.trim()][0]?.toLocaleUpperCase(getLocale())}
      </span>
      <div className="directory-record-copy">
        <strong>{name}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
