/**
 * Return the total number of messages represented by a SOGo folder response.
 * SOGo may return all folder UIDs while `headers` contains only a paginated row set.
 */
export function getMessageTotal(data, loadedCount = 0) {
  if (Array.isArray(data?.uids)) return data.uids.length;

  for (const value of [data?.total, data?.totalCount, data?.count]) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }

  return loadedCount;
}
