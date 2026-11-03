import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { Input } from "../ui/input";

/** Directory and picker search share their complete appearance, label and focus behavior. */
export function SearchField({
  label,
  ...props
}: Omit<ComponentProps<typeof Input>, "type" | "autoFocus"> & {
  label: string;
}) {
  return (
    <label className="search-field" htmlFor={props.id}>
      <Search aria-hidden="true" size={17} />
      <span className="sr-only">{label}</span>
      <Input
        maxLength={80}
        placeholder={label}
        {...props}
        type="search"
        autoFocus={false}
      />
    </label>
  );
}
