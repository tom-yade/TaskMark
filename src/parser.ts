export interface TaskMarkData {
  tagColors: Record<string, string>;
  groupTags: Record<string, string[]>; // Key is "YYYY-MM-DD::groupName"
  days: Record<string, DayData>; // Key is YYYY-MM-DD
}

export interface ParseResult {
  data: TaskMarkData;
  warnings: string[];
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
  startDate: string;
  endDate?: string;
}

// ─── Regex Patterns ────────────────────────────────────────────
const TAG_COLOR_REGEX = /^#([^\s:]+)\s*:\s*(.+)$/;
// Keep in sync with VALID_CSS_COLOR_RE in media/main.js
export const VALID_CSS_COLOR_REGEX = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|hsl)a?\(\s*\d[\d.]*%?(?:\s*[,/\s]\s*\d[\d.]*%?){2,3}\s*\)|[a-zA-Z]{1,30})$/;
const DATE_REGEX = /^#\s+(\d{4}-\d{1,2}-\d{1,2})(?:\s*:\s*(\d{4}-\d{1,2}-\d{1,2}))?/;
const GROUP_REGEX = /^>\s*([^-\s].+)$/;
const ITEM_REGEX = /^(>\s*)?(-)?\s*(\[\s*([xX\s])\s*\])?\s*((\d{1,2}:\d{1,2})(?:-(\d{1,2}:\d{1,2}))?)?\s*(.*)$/;
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

/** Normalize a time part like "9:0" to "9:00" */
function normalizeTimePart(t: string): string {
  const [h, m] = t.split(':');
  return `${h}:${m.padStart(2, '0')}`;
}

/** Normalize a time string like "9:0-17:0" to "9:00-17:00" */
function normalizeTimeStr(timeStr: string): string {
  return timeStr.split('-').map(normalizeTimePart).join('-');
}

/** Parse and normalize a date string to 'YYYY-MM-DD'. Returns null if invalid. */
function tryNormalizeDate(dateStr: string): string | null {
  try {
    return toLocaleDateStr(parseLocalDate(dateStr));
  } catch {
    return null;
  }
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
  exceptDates: Set<string>;
}

const MAX_OCCURRENCES = 3650;

function parseRepeatOptions(repeatStr: string, lineNum: number, warnings: string[]): RepeatOptions {
  const parts = repeatStr.split(',').map(s => s.trim());
  let mode: 'days' | 'months' = 'days';
  let interval = 7; // default: weekly
  let until: Date | undefined;
  let count: number | undefined;
  const exceptDates = new Set<string>();

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
      const normalized = tryNormalizeDate(dateStr);
      if (normalized) {
        until = parseLocalDate(normalized);
      } else if (dateStr) {
        warnings.push(`Line ${lineNum + 1}: invalid until date '${dateStr}', skipped`);
      }
    } else if (part.startsWith('count:')) {
      const parsedCount = parseInt(part.substring(6), 10);
      if (!isNaN(parsedCount)) count = parsedCount;
    } else if (part.startsWith('except:')) {
      for (const d of part.substring(7).trim().split(/\s+/).filter(Boolean)) {
        const normalized = tryNormalizeDate(d);
        if (normalized) {
          exceptDates.add(normalized);
        } else {
          warnings.push(`Line ${lineNum + 1}: invalid except date '${d}', skipped`);
        }
      }
    }
  }

  const finalCount = count !== undefined ? count : MAX_OCCURRENCES;

  return { mode, interval, until, count: finalCount, exceptDates };
}

// ─── Main Parser ───────────────────────────────────────────────

export function parseTmd(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const data: TaskMarkData = { tagColors: {}, groupTags: {}, days: {} };
  const warnings: string[] = [];

  let inTagsBlock = false;
  let currentDate = '';
  let currentEndDate = '';
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
      if (match) {
        const colorValue = match[2].trim();
        if (VALID_CSS_COLOR_REGEX.test(colorValue)) {
          data.tagColors[match[1]] = colorValue;
        } else {
          warnings.push(`Line ${i + 1}: invalid color value '${colorValue}', skipped`);
        }
      } else {
        warnings.push(`Line ${i + 1}: invalid tag definition '${line}', skipped`);
      }
      continue;
    }

    // 2. Date header
    const dateMatch = line.match(DATE_REGEX);
    if (dateMatch) {
      const normalizedStart = tryNormalizeDate(dateMatch[1]);
      if (!normalizedStart) {
        warnings.push(`Line ${i + 1}: invalid date '${dateMatch[1]}', skipped`);
        currentDate = '';
        continue;
      }
      currentDate = normalizedStart;
      currentEndDate = '';
      if (dateMatch[2]) {
        const normalizedEnd = tryNormalizeDate(dateMatch[2]);
        if (!normalizedEnd) {
          warnings.push(`Line ${i + 1}: invalid end date '${dateMatch[2]}', skipped`);
        } else if (normalizedEnd < currentDate) {
          warnings.push(`Line ${i + 1}: end date '${dateMatch[2]}' is before start date, skipped`);
        } else {
          currentEndDate = normalizedEnd;
        }
      }
      ensureDay(data.days, currentDate);
      currentGroup = '';
      continue;
    }

    // 3. Group header
    const groupMatch = line.match(GROUP_REGEX);
    if (groupMatch) {
      const { tags: gTags, cleaned: gName } = extractTags(groupMatch[1].trim());
      if (!gName) {
        warnings.push(`Line ${i + 1}: group header has no name, skipped`);
        continue;
      }
      currentGroup = gName;
      if (gTags.length > 0 && currentDate) {
        data.groupTags[`${currentDate}::${currentGroup}`] = gTags;
      }
      continue;
    }

    // 4. Item (schedule or task)
    const itemMatch = rawLine.match(ITEM_REGEX);
    if (itemMatch && itemMatch[2]) {
      const result = createMarkItem(itemMatch, i, currentDate, currentGroup, currentEndDate);
      if (result) {
        data.days[currentDate].items.push(result.item);
        currentGroup = result.newGroup;
      }
    }
  }

  return { data: expandRepeats(data, warnings), warnings: [...new Set(warnings)] };
}

function createMarkItem(
  itemMatch: RegExpMatchArray,
  lineIndex: number,
  currentDate: string,
  currentGroup: string,
  endDate = '',
): { item: MarkItem; newGroup: string } | null {
  if (!currentDate) {
    return null;
  }

  const isQuote = !!itemMatch[1];
  const newGroup = isQuote ? currentGroup : '';

  const hasCheckbox = itemMatch[3];
  const checkMark = itemMatch[4];
  const timeString = itemMatch[5] ? normalizeTimeStr(itemMatch[5]) : undefined;
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
    rawLine: lineIndex,
    startDate: currentDate,
    endDate: endDate || undefined,
  };

  return { item, newGroup };
}

// ─── Repeat Expansion ──────────────────────────────────────────

function expandRepeats(data: TaskMarkData, warnings: string[]): TaskMarkData {
  const expandedDays: Record<string, DayData> = {};
  for (const [date, day] of Object.entries(data.days)) {
    expandedDays[date] = { date, items: day.items.map(item => ({ ...item, tags: [...item.tags] })) };
  }

  Object.values(data.days).forEach(day => {
    day.items.forEach(item => {
      if (!item.repeat || item.type === 'task' || item.endDate) return;

      generateRepeatedItems(item, day.date, expandedDays, warnings);
    });
  });

  return { ...data, days: expandedDays };
}

function generateRepeatedItems(item: MarkItem, originDateStr: string, expandedDays: Record<string, DayData>, warnings: string[]) {
  const origin = parseLocalDate(originDateStr);
  const opts = parseRepeatOptions(item.repeat!, item.rawLine, warnings);
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
    if (opts.exceptDates.has(isoDate)) { continue; }

    ensureDay(expandedDays, isoDate);
    expandedDays[isoDate].items.push({ ...item, id: `${item.id}-rep${i}`, tags: [...item.tags] });
  }
}
