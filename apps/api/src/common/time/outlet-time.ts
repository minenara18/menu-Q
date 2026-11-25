/**
 * Pure outlet-time helpers. All calculations use an explicit IANA time zone so
 * results never depend on the machine/process TZ (UTC, Asia/Jakarta, ...).
 */
const SECONDS = 1000;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** YYYY-MM-DD for the given instant in the outlet's time zone. */
export function outletDayKey(at: Date | number | string, timeZone: string): string {
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('Invalid instant for outletDayKey');
  }
  const { year, month, day } = partsInZone(instant, timeZone || 'UTC');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** UTC bounds [start, end) of the outlet's business day containing `at`. */
export function outletDayBounds(at: Date | number | string, timeZone: string): { startUtc: Date; endUtc: Date } {
  const instant = new Date(at);
  const zone = timeZone || 'UTC';
  const parts = partsInZone(instant, zone);

  // Offset of the zone at this instant, derived without using the machine TZ.
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = localAsUtc - Math.floor(instant.getTime() / SECONDS) * SECONDS;

  const startMs = Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMs;
  return {
    startUtc: new Date(startMs),
    endUtc: new Date(startMs + 24 * 60 * 60 * 1000),
  };
}
