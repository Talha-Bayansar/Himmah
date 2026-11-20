export function isQuotaError(error: unknown): boolean {
  const value = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    cause?: unknown;
  };
  return (
    /exceeded.*quota|quota.*exceeded|GENERIC_QUOTA_EXCEEDED|HTTP status 402|SQLSTATE.?53000/i.test(
      String(value?.message ?? error),
    ) ||
    value?.code === "53000" ||
    value?.status === 402 ||
    (!!value?.cause &&
      value.cause !== error &&
      /quota|402|53000/i.test(String(value.cause)))
  );
}
