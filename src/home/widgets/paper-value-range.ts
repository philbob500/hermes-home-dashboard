export interface TimestampedPoint {
  at: string;
}

export function selectRangePoints<T extends TimestampedPoint>(rows: T[], duration: number): T[] {
  if (duration <= 0 || rows.length === 0) return rows;
  const latest = Date.parse(rows[rows.length - 1].at);
  const cutoff = latest - duration;
  return rows.filter((point) => Date.parse(point.at) >= cutoff);
}
