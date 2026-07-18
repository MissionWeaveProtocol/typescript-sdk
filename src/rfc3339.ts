const RFC3339 =
  /^(?<year>[0-9]{4})-(?<month>[0-9]{2})-(?<day>[0-9]{2})[Tt](?<hour>[0-9]{2}):(?<minute>[0-9]{2}):(?<second>[0-9]{2})(?:\.(?<fraction>[0-9]+))?(?<offset>[Zz]|[+-][0-9]{2}:[0-9]{2})$/u;

export interface Rfc3339Instant {
  readonly epochSecond: bigint;
  readonly fraction: string;
}

export function parseRfc3339Instant(value: string): Rfc3339Instant {
  const match = RFC3339.exec(value);
  const groups = match?.groups;
  if (!groups) throw new TypeError("Expected an RFC 3339 timestamp");

  const year = decimal(groups["year"]);
  const month = decimal(groups["month"]);
  const day = decimal(groups["day"]);
  const hour = decimal(groups["hour"]);
  const minute = decimal(groups["minute"]);
  const second = decimal(groups["second"]);
  if (year === 0) throw new TypeError("RFC 3339 year 0000 is unsupported");
  if (month < 1 || month > 12) throw new TypeError("Invalid RFC 3339 month");
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (day < 1 || day > (monthLengths[month - 1] ?? 0)) {
    throw new TypeError("Invalid RFC 3339 day");
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError("Invalid RFC 3339 time");
  }

  const offset = groups["offset"] ?? "";
  if (offset === "-00:00") {
    throw new TypeError("RFC 3339 unknown local offset is not an instant");
  }
  let offsetSeconds = 0;
  if (offset !== "Z" && offset !== "z") {
    const offsetHour = decimal(offset.slice(1, 3));
    const offsetMinute = decimal(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new TypeError("RFC 3339 numeric offset is out of range");
    }
    const direction = offset[0] === "+" ? 1 : -1;
    offsetSeconds = direction * (offsetHour * 3600 + offsetMinute * 60);
  }

  const localSecond =
    daysFromCivil(year, month, day) * 86_400 +
    hour * 3600 +
    minute * 60 +
    second;
  return Object.freeze({
    epochSecond: BigInt(localSecond - offsetSeconds),
    fraction: (groups["fraction"] ?? "").replace(/0+$/u, ""),
  });
}

export function compareRfc3339Instants(
  left: Rfc3339Instant,
  right: Rfc3339Instant,
): number {
  if (left.epochSecond < right.epochSecond) return -1;
  if (left.epochSecond > right.epochSecond) return 1;
  const width = Math.max(left.fraction.length, right.fraction.length);
  const leftFraction = left.fraction.padEnd(width, "0");
  const rightFraction = right.fraction.padEnd(width, "0");
  return leftFraction < rightFraction
    ? -1
    : leftFraction > rightFraction
      ? 1
      : 0;
}

export function isProtocolRfc3339(value: string): boolean {
  try {
    parseRfc3339Instant(value);
    return true;
  } catch {
    return false;
  }
}

function decimal(value: string | undefined): number {
  if (value === undefined) throw new TypeError("Missing RFC 3339 component");
  return Number.parseInt(value, 10);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}
