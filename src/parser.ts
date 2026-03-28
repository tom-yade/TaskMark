export interface TaskMarkData {
  tagColors: Record<string, string>;
  days: Record<string, DayData>; // Key is YYYY-MM-DD
}

export interface DayData {
  date: string;
  items: MarkItem[];
}

export type ItemType = 'schedule' | 'task';
export type TaskStatus = 'todo' | 'done';

export interface MarkItem {
  id: string;
  type: ItemType;
  text: string;
  time?: string;
  tags: string[];
  status?: TaskStatus;
  repeat?: string;
  group?: string;
  rawLine: number;
}

// ─── Regex Patterns ────────────────────────────────────────────
const TAG_COLOR_REGEX = /^#([^\s:]+)\s*:\s*(.+)$/;
const DATE_REGEX = /^#\s+(\d{4}-\d{2}-\d{2})/;
const GROUP_REGEX = /^>\s*([^-\s].+)$/;
const ITEM_REGEX = /^(>\s*)?(-)?\s*(\[\s*([xX\s])\s*\])?\s*((\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?\s*(.*)$/;
const REPEAT_REGEX = /@repeat\(([^)]+)\)/;
const TAG_SPLIT_REGEX = /#([^\s#]+)/g;
const EVERY_REGEX = /^(\d+)(days?|weeks?|months?)$/;

function toLocaleDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Helpers ───────────────────────────────────────────────────

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(s => parseInt(s, 10));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

/** Ensure a day entry exists in the days record, returning it */
function ensureDay(days: Record<string, DayData>, dateStr: string): DayData {
  if (!days[dateStr]) {
    days[dateStr] = { date: dateStr, items: [] };
  }
  return days[dateStr];
}

/** Extract all #tag occurrences from content, returning tags and cleaned content */
function extractTags(content: string): { tags: string[]; cleaned: string } {
  const tags: string[] = [];
  let match;
  // Reset lastIndex before each exec loop (global regex)
  TAG_SPLIT_REGEX.lastIndex = 0;
  while ((match = TAG_SPLIT_REGEX.exec(content)) !== null) {
    tags.push(match[1]);
  }
  const cleaned = content.replace(TAG_SPLIT_REGEX, '').trim();
  return { tags, cleaned };
}

// ─── Repeat Options ────────────────────────────────────────────

interface RepeatOptions {
  mode: 'days' | 'months';
  interval: number; // days when mode='days', months when mode='months'
  until?: Date;
  count: number;
  exceptDates: string[];
}

const MAX_OCCURRENCES = 3650;

function parseRepeatOptions(repeatStr: string): RepeatOptions {
  const parts = repeatStr.split(',').map(s => s.trim());
  let mode: 'days' | 'months' = 'days';
  let interval = 7; // default: weekly
  let until: Date | undefined;
  let count: number | undefined;
  const exceptDates: string[] = [];

  for (const part of parts) {
    if (part.startsWith('every:')) {
      const match = part.substring(6).match(EVERY_REGEX);
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2].replace(/s$/, '');
        if (unit === 'day') { mode = 'days'; interval = num; }
        else if (unit === 'week') { mode = 'days'; interval = num * 7; }
        else if (unit === 'month') { mode = 'months'; interval = num; }
      }
    } else if (part === 'daily') {
      mode = 'days'; interval = 1;
    } else if (part === 'weekly') {
      mode = 'days'; interval = 7;
    } else if (part === 'monthly') {
      mode = 'months'; interval = 1;
    } else if (part.startsWith('until:')) {
      const dateStr = part.substring(6);
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        until = parseLocalDate(dateStr);
      }
    } else if (part.startsWith('count:')) {
      const parsedCount = parseInt(part.substring(6), 10);
      if (!isNaN(parsedCount)) count = parsedCount;
    } else if (part.startsWith('except:')) {
      const dates = part.substring(7).split(' ');
      for (const d of dates) {
        if (d.match(/^\d{4}-\d{2}-\d{2}$/)) { exceptDates.push(d); }
      }
    }
  }

  const finalCount = count !== undefined ? count : MAX_OCCURRENCES;

  return { mode, interval, until, count: finalCount, exceptDates };
}

// ─── Main Parser ───────────────────────────────────────────────

export function parseTmd(text: string): TaskMarkData {
  const lines = text.split(/\r?\n/);
  const data: TaskMarkData = { tagColors: {}, days: {} };

  let inTagsBlock = false;
  let currentDate = '';
  let currentGroup = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      currentGroup = '';
      continue;
    }

    // 1. Tags block
    if (line === '@tags') { inTagsBlock = true; continue; }
    if (line === '@end' && inTagsBlock) { inTagsBlock = false; continue; }
    if (inTagsBlock) {
      const match = line.match(TAG_COLOR_REGEX);
      if (match) data.tagColors[match[1]] = match[2].trim();
      continue;
    }

    // 2. Date header
    const dateMatch = line.match(DATE_REGEX);
    if (dateMatch) {
      currentDate = dateMatch[1];
      ensureDay(data.days, currentDate);
      currentGroup = '';
      continue;
    }

    // 3. Group header
    const groupMatch = line.match(GROUP_REGEX);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      continue;
    }

    // 4. Item (schedule or task)
    const itemMatch = rawLine.match(ITEM_REGEX);
    if (itemMatch && itemMatch[2]) {
      const result = createMarkItem(itemMatch, i, currentDate, currentGroup);
      if (result) {
        data.days[currentDate].items.push(result.item);
        currentGroup = result.newGroup;
      }
    }
  }

  return expandRepeats(data);
}

function createMarkItem(
  itemMatch: RegExpMatchArray,
  lineIndex: number,
  currentDate: string,
  currentGroup: string,
): { item: MarkItem; newGroup: string } | null {
  if (!currentDate) {
    return null;
  }

  const isQuote = !!itemMatch[1];
  const newGroup = isQuote ? currentGroup : '';

  const hasCheckbox = itemMatch[3];
  const checkMark = itemMatch[4];
  const timeString = itemMatch[5];
  let content = itemMatch[8] || '';

  const type: ItemType = hasCheckbox ? 'task' : 'schedule';
  const status: TaskStatus | undefined = hasCheckbox
    ? (checkMark.trim().toLowerCase() === 'x' ? 'done' : 'todo')
    : undefined;

  // Extract repeat
  let repeatStr: string | undefined;
  const rMatch = content.match(REPEAT_REGEX);
  if (rMatch) {
    repeatStr = rMatch[1];
    content = content.replace(REPEAT_REGEX, '');
  }

  // Extract tags
  const { tags, cleaned } = extractTags(content);

  const item: MarkItem = {
    id: `item-${lineIndex}-${currentDate}`,
    type,
    text: cleaned,
    time: timeString,
    tags,
    status,
    repeat: repeatStr,
    group: newGroup || undefined,
    rawLine: lineIndex
  };

  return { item, newGroup };
}

// ─── Repeat Expansion ──────────────────────────────────────────

function expandRepeats(data: TaskMarkData): TaskMarkData {
  const expandedDays: Record<string, DayData> = {};
  for (const [date, day] of Object.entries(data.days)) {
    expandedDays[date] = { date, items: day.items.map(item => ({ ...item, tags: [...item.tags] })) };
  }

  Object.values(data.days).forEach(day => {
    day.items.forEach(item => {
      if (!item.repeat || item.type === 'task') return;

      generateRepeatedItems(item, day.date, expandedDays);
    });
  });

  return { ...data, days: expandedDays };
}

function generateRepeatedItems(item: MarkItem, originDateStr: string, expandedDays: Record<string, DayData>) {
  const origin = parseLocalDate(originDateStr);
  const opts = parseRepeatOptions(item.repeat!);
  for (let i = 1; i < opts.count; i++) {
    const nextDate = new Date(origin);

    if (opts.mode === 'months') {
      const targetMonth = origin.getMonth() + opts.interval * i;
      nextDate.setMonth(targetMonth);
      if (nextDate.getMonth() !== targetMonth % 12) {
        nextDate.setDate(0); // clamp to last day of intended month
      }
    } else {
      nextDate.setDate(origin.getDate() + opts.interval * i);
    }

    if (opts.until && nextDate > opts.until) break;

    const isoDate = toLocaleDateStr(nextDate);
    if (opts.exceptDates.includes(isoDate)) { continue; }

    ensureDay(expandedDays, isoDate);
    expandedDays[isoDate].items.push({ ...item, id: `${item.id}-rep${i}`, tags: [...item.tags] });
  }
}
