import { describe, it, expect } from 'vitest';
import { marketStatus } from '../worker/market';
const market = (date: string) => marketStatus(Date.parse(date));
describe('bullion session calendar', () => {
  it('closes Friday 17:00 New York and opens Sunday 18:00', () => {
    expect(market('2026-10-02T20:59:59Z').open).toBe(true);
    expect(market('2026-10-02T21:00:00Z').reason).toBe('weekend');
    expect(market('2026-10-04T21:59:59Z').open).toBe(false);
    expect(market('2026-10-04T22:00:00Z').open).toBe(true);
  });
  it('handles the daily break and reopening', () => {
    const result = market('2026-10-05T21:30:00Z'); expect(result.reason).toBe('daily-break');
    expect(new Date(result.nextOpenAt).toISOString()).toBe('2026-10-05T22:00:00.000Z');
  });
  it('handles a daylight-saving change during a closed weekend', () => {
    expect(new Date(market('2026-10-31T12:00:00Z').nextOpenAt).toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(new Date(market('2027-03-13T12:00:00Z').nextOpenAt).toISOString()).toBe('2027-03-14T22:00:00.000Z');
  });
});
