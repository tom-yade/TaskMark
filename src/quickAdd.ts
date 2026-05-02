// Pure helpers backing the TaskMark: Add Task / Add Schedule commands.
// Kept free of vscode imports so the logic can be unit-tested without
// the VS Code test runner.

const DATE_HEADER_REGEX = /^#\s+(\d{4}-\d{1,2}-\d{1,2})/;
const FULL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function formatTaskLine(text: string): string {
  return `- [ ] ${text.trim()}`;
}

export function formatScheduleLine(text: string, startTime: string, endTime?: string): string {
  const trimmed = text.trim();
  const time = endTime ? `${startTime}-${endTime}` : startTime;
  return trimmed ? `- ${time} ${trimmed}` : `- ${time}`;
}

export interface InsertResult {
  newText: string;
  /** Zero-based line index of the inserted item line in `newText`. */
  insertedLineIndex: number;
}

/**
 * Insert `itemLine` into the section for `dateStr`.
 * - If a section header for the date exists, append the line after the
 *   last non-empty line within that section.
 * - If no section exists, append a new `# YYYY-MM-DD` section followed
 *   by the item to the end of the document, keeping any trailing blank
 *   lines intact.
 *
 * `dateStr` is matched against the section header in normalized form so
 * a header like `# 2026-3-5` still matches `dateStr = '2026-03-05'`.
 */
export function insertItemForDate(
  documentText: string,
  dateStr: string,
  itemLine: string
): InsertResult {
  const lines = documentText === '' ? [] : documentText.split(/\r?\n/);
  const sectionStart = findSectionStart(lines, dateStr);

  if (sectionStart === -1) {
    return appendNewSection(lines, dateStr, itemLine);
  }
  return appendToExistingSection(lines, sectionStart, itemLine);
}

function findSectionStart(lines: string[], dateStr: string): number {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_HEADER_REGEX);
    if (m && normalizeDate(m[1]) === dateStr) {
      return i;
    }
  }
  return -1;
}

function appendNewSection(lines: string[], dateStr: string, itemLine: string): InsertResult {
  let trimEnd = lines.length;
  while (trimEnd > 0 && lines[trimEnd - 1].trim() === '') {
    trimEnd--;
  }
  const head = lines.slice(0, trimEnd);
  const tail = lines.slice(trimEnd);

  const inserted: string[] = [];
  if (head.length > 0) {
    inserted.push('');
  }
  inserted.push(`# ${dateStr}`);
  inserted.push(itemLine);

  const newLines = [...head, ...inserted, ...tail];
  const insertedLineIndex = head.length + inserted.length - 1;
  return { newText: newLines.join('\n'), insertedLineIndex };
}

function appendToExistingSection(lines: string[], sectionStart: number, itemLine: string): InsertResult {
  let nextSection = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (DATE_HEADER_REGEX.test(lines[i])) {
      nextSection = i;
      break;
    }
  }

  let insertAfter = sectionStart;
  for (let i = sectionStart + 1; i < nextSection; i++) {
    if (lines[i].trim() !== '') {
      insertAfter = i;
    }
  }

  const newLines = [
    ...lines.slice(0, insertAfter + 1),
    itemLine,
    ...lines.slice(insertAfter + 1),
  ];
  return { newText: newLines.join('\n'), insertedLineIndex: insertAfter + 1 };
}

function normalizeDate(raw: string): string {
  const [y, m, d] = raw.split('-');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function isValidDate(s: string): boolean {
  if (!FULL_DATE_REGEX.test(s)) {
    return false;
  }
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function isValidTime(s: string): boolean {
  return TIME_REGEX.test(s);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetDate(base: Date, days: number): Date {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + days);
  return next;
}
