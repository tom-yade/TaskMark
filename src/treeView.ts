import { MarkItem, TaskMarkData, parseLocalDate } from './parser';

export const RECENTLY_DONE_LIMIT = 10;

export interface TreeCategorizedItems {
  today: MarkItem[];
  thisWeek: MarkItem[];
  overdue: MarkItem[];
  recentlyDone: MarkItem[];
}

interface Occurrence {
  item: MarkItem;
  dayKey: string;
  start: string;
  end: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = parseLocalDate(dateStr);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offsetToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

function timeStartMinutes(time: string): number {
  const start = time.split('-')[0];
  const [h, m] = start.split(':').map(s => parseInt(s, 10));
  return h * 60 + m;
}

function compareByTimeThenLine(a: MarkItem, b: MarkItem): number {
  if (a.time && b.time) {
    return timeStartMinutes(a.time) - timeStartMinutes(b.time) || a.rawLine - b.rawLine;
  }
  if (a.time) { return -1; }
  if (b.time) { return 1; }
  return a.rawLine - b.rawLine;
}

function buildOccurrences(data: TaskMarkData): Occurrence[] {
  const out: Occurrence[] = [];
  for (const [dayKey, day] of Object.entries(data.days)) {
    for (const item of day.items) {
      const start = item.endDate ? item.startDate : dayKey;
      const end = item.endDate ?? dayKey;
      out.push({ item, dayKey, start, end });
    }
  }
  return out;
}

export function categorizeForTreeView(
  data: TaskMarkData,
  todayStr: string
): TreeCategorizedItems {
  const occurrences = buildOccurrences(data);
  const week = getWeekRange(todayStr);

  const today: MarkItem[] = [];
  const thisWeek: MarkItem[] = [];
  const overdue: MarkItem[] = [];
  const recentlyDoneOcc: Occurrence[] = [];

  for (const occ of occurrences) {
    const inToday = todayStr >= occ.start && todayStr <= occ.end;
    if (inToday) {
      today.push(occ.item);
    } else if (occ.start <= week.end && occ.end >= week.start) {
      thisWeek.push(occ.item);
    }

    if (occ.item.type === 'task' && occ.item.status === 'todo' && occ.end < todayStr) {
      overdue.push(occ.item);
    }

    if (occ.item.type === 'task' && occ.item.status === 'done' && occ.end <= todayStr) {
      recentlyDoneOcc.push(occ);
    }
  }

  today.sort(compareByTimeThenLine);
  thisWeek.sort((a, b) => a.startDate.localeCompare(b.startDate) || compareByTimeThenLine(a, b));
  overdue.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.rawLine - b.rawLine);
  recentlyDoneOcc.sort((a, b) => b.end.localeCompare(a.end) || b.item.rawLine - a.item.rawLine);

  return {
    today,
    thisWeek,
    overdue,
    recentlyDone: recentlyDoneOcc.slice(0, RECENTLY_DONE_LIMIT).map(o => o.item)
  };
}

export function todayDateStr(now: Date = new Date()): string {
  return toDateStr(now);
}

export type CategoryId = 'today' | 'thisWeek' | 'overdue' | 'recentlyDone';

export const CATEGORY_ORDER: CategoryId[] = ['today', 'thisWeek', 'overdue', 'recentlyDone'];

export function categoryLabel(id: CategoryId, todayStr: string): string {
  switch (id) {
    case 'today': return `Today (${todayStr})`;
    case 'thisWeek': return 'This week';
    case 'overdue': return 'Overdue';
    case 'recentlyDone': return 'Recently done';
  }
}

export function formatItemLabel(item: MarkItem): string {
  const checkbox = item.type === 'task' ? (item.status === 'done' ? '[x] ' : '[ ] ') : '';
  const time = item.time ? `${item.time} ` : '';
  return `${checkbox}${time}${item.text}`.trim();
}
