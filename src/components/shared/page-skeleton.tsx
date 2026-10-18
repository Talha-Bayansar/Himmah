import { useLocale } from "@/localization/locale";
import { m } from "@/paraglide/messages.js";
import { Skeleton } from "@/components/ui/skeleton";
export function PageSkeleton() {
  useLocale();
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-8 p-6 md:p-10"
      role="status"
      aria-label={m.loading_page()}
    >
      <span className="sr-only">{m.loading_page()}</span>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    </div>
  );
}
export function AccountSkeleton() {
  useLocale();
  return (
    <div className="space-y-6" role="status" aria-label={m.loading_account()}>
      <span className="sr-only">{m.loading_account_detail()}</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <div className="space-y-4">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
