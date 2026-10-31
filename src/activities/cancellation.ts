export type CancellationPreview = {
  snapshot: string;
  seriesId: string | null;
  items: {
    id: string;
    name: string;
    topic: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    registrations: number;
    attendance: number;
    charges: number;
    collectedMinor: number;
  }[];
};
export function cancellationTotals(preview: CancellationPreview) {
  return preview.items.reduce(
    (total, item) => ({
      registrations: total.registrations + item.registrations,
      attendance: total.attendance + item.attendance,
      charges: total.charges + item.charges,
      collectedMinor: total.collectedMinor + item.collectedMinor,
    }),
    { registrations: 0, attendance: 0, charges: 0, collectedMinor: 0 },
  );
}
