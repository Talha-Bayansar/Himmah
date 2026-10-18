import { useLocale } from "@/localization/locale";
import { m } from "@/paraglide/messages.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
export interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}
const Context = createContext<
  ((options: ConfirmationOptions) => Promise<boolean>) | null
>(null);
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);
  const confirm = useCallback(
    (next: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );
  useEffect(
    () => () => {
      resolver.current?.(false);
    },
    [],
  );
  return (
    <Context.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {options?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {m.cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                options?.destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : ""
              }
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? m.continue_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Context.Provider>
  );
}
export function useConfirmation() {
  const confirm = useContext(Context);
  if (!confirm) throw Error("useConfirmation requires ConfirmationProvider.");
  return confirm;
}
