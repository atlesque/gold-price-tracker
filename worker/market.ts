// Conventional bullion trading week: Sunday 18:00–Friday 17:00 New York,
// with a daily 17:00–18:00 break. DST is handled by the IANA time zone.
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});
export function marketStatus(now: number): { open: boolean; reason: 'weekend' | 'daily-break' | null; nextOpenAt: number } {
  const parts = formatter.formatToParts(now);
  const day = parts.find(p => p.type === 'weekday')!.value;
  const hour = Number(parts.find(p => p.type === 'hour')!.value);
  const weekend = day === 'Sat' || (day === 'Fri' && hour >= 17) || (day === 'Sun' && hour < 18);
  const dailyBreak = !weekend && hour === 17;
  if (!weekend && !dailyBreak) return { open: true, reason: null, nextOpenAt: now };
  const field = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === name)!.value);
  const daysAhead = weekend ? (day === 'Fri' ? 2 : day === 'Sat' ? 1 : 0) : 0;
  const localTarget = Date.UTC(field('year'), field('month') - 1, field('day') + daysAhead, 18);
  let next = localTarget;
  // Resolve the UTC offset at reopening, including a DST change over the weekend.
  for (let i = 0; i < 2; i++) {
    const p = formatter.formatToParts(next);
    const get = (name: Intl.DateTimeFormatPartTypes) => Number(p.find(p => p.type === name)!.value);
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    next += localTarget - local;
  }
  return { open: false, reason: weekend ? 'weekend' : 'daily-break', nextOpenAt: next };
}
