import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { m } from "../../paraglide/messages.js";
import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "../ui/drawer";
import { DirectoryHeader } from "./directory-layout";

/** Complex workflows own a route; short edits use the shadcn/Vaul bottom drawer. */
export function FormSurface({
  title,
  description,
  page = false,
  onClose,
  children,
}: {
  title: string;
  description: string;
  page?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (page)
    return (
      <section className="directory form-page" aria-label={title}>
        <Button
          type="button"
          variant="link"
          className="settings-back"
          onClick={onClose}
        >
          <ArrowLeft aria-hidden="true" />
          {m.form_back()}
        </Button>
        <DirectoryHeader
          title={title}
          description={description}
          autoFocus={false}
        />
        {children}
      </section>
    );
  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      repositionInputs={false}
      autoFocus={false}
    >
      <DrawerContent className="form-sheet">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="form-sheet-body">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
