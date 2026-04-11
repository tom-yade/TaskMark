import { TaskMarkData } from './parser';

const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;

export interface GanttChildItem {
  text: string;
  tags: string[];
  startMs: number;
  endMs: number;
  isTask: boolean;
  isDone: boolean;
}

export interface GanttEntity {
  name: string;
  isGroup: boolean;
  minTime: number;
  maxTime: number;
  tags: string[];
  tasksTotal: number;
  tasksDone: number;
  children: GanttChildItem[];
}

function parseLocalDate(dateStr: string): Date {
  const p = dateStr.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

function getEndOfDayMs(dateStr: string): number {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + 1);
  return d.getTime() - 1;
}

function itemHasTime(item: { time?: string; endDate?: string }): boolean {
  return !!(item.time && !item.endDate);
}

export function buildGanttEntities(
  data: TaskMarkData
): { entities: GanttEntity[]; lastDateStr: string } {
  const sortedDates = Object.keys(data.days).sort();

  if (sortedDates.length === 0) {
    return { entities: [], lastDateStr: '' };
  }

  const entities: Record<string, GanttEntity> = {};
  let lastDateStr = sortedDates[sortedDates.length - 1];

  sortedDates.forEach(dStr => {
    const dayData = data.days[dStr];
    const dayStartMs = parseLocalDate(dStr).getTime();

    dayData.items.forEach(item => {
      if (item.endDate && item.endDate > lastDateStr) {
        lastDateStr = item.endDate;
      }

      let startMs = dayStartMs;
      let endMs = item.endDate ? getEndOfDayMs(item.endDate) : getEndOfDayMs(dStr);

      if (itemHasTime(item)) {
        const parts = item.time!.split('-');
        const sTime = parts[0].trim().split(':');
        if (sTime.length >= 2) {
          startMs = dayStartMs + parseInt(sTime[0]) * MS_PER_HOUR + parseInt(sTime[1]) * MS_PER_MINUTE;
        }
        if (parts[1]) {
          const eTime = parts[1].trim().split(':');
          if (eTime.length >= 2) {
            endMs = dayStartMs + parseInt(eTime[0]) * MS_PER_HOUR + parseInt(eTime[1]) * MS_PER_MINUTE;
          }
        } else {
          endMs = startMs + MS_PER_HOUR;
        }
      }

      const eName = item.group ? `[Group] ${item.group}` : item.text;
      if (!entities[eName]) {
        entities[eName] = {
          name: item.group || item.text,
          isGroup: !!item.group,
          minTime: startMs,
          maxTime: endMs,
          tags: item.tags || [],
          tasksTotal: 0,
          tasksDone: 0,
          children: []
        };
      } else {
        if (startMs < entities[eName].minTime) { entities[eName].minTime = startMs; }
        if (endMs > entities[eName].maxTime) { entities[eName].maxTime = endMs; }
      }

      entities[eName].children.push({
        text: item.text,
        tags: item.tags || [],
        startMs,
        endMs,
        isTask: item.type === 'task',
        isDone: item.status === 'done'
      });

      if (item.type === 'task') {
        entities[eName].tasksTotal++;
        if (item.status === 'done') {
          entities[eName].tasksDone++;
        }
      }
    });
  });

  const entityArray = Object.values(entities).sort(
    (a, b) => a.minTime - b.minTime || a.name.localeCompare(b.name)
  );

  return { entities: entityArray, lastDateStr };
}
