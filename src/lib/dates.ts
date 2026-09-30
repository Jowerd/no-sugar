export function localDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + count);
  return localDate(date);
}
export function dayNumber(start: string, today: string): number {
  const utc = (s: string) => { const [y,m,d] = s.split('-').map(Number); return Date.UTC(y,m-1,d); };
  return Math.round((utc(today) - utc(start)) / 86400000) + 1;
}
