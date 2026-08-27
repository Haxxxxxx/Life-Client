/** Generic day-by-day streak math shared by Challenges (sport-derived) and Habits (manual check-ins). */

export function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

export function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  let cur = start;
  while (cur <= end) {
    result.push(cur);
    cur = addDays(cur, 1);
  }
  return result;
}

export interface DayCompletion {
  date: string;
  completed: boolean;
}

export function computeCurrentStreak(days: DayCompletion[]): number {
  let i = days.length - 1;
  // Today may simply not be logged yet — don't treat that as breaking the
  // streak, just don't count it until it's actually done.
  if (i >= 0 && !days[i]!.completed) i -= 1;
  let streak = 0;
  for (; i >= 0; i--) {
    if (!days[i]!.completed) break;
    streak += 1;
  }
  return streak;
}

export function computeLongestStreak(days: DayCompletion[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.completed) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}
