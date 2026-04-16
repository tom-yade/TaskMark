import { TaskMarkData, parseLocalDate } from './parser';

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
  id: string;
  name: string;
  lane: string;
  isGroup: boolean;
  minTime: number;
  maxTime: number;
  tags: string[];
  tasksTotal: number;
  tasksDone: number;
  children: GanttChildItem[];
}

function getEndOfDayMs(dateStr: string): number {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + 1);
  return d.getTime() - 1;
}

function itemHasTime(item: { time?: string; endDate?: string }): boolean {
  return !!(item.time && !item.endDate);
}

export interface GanttData {
  entities: GanttEntity[];
  lastDateStr: string;
}

export function buildGanttEntities(data: TaskMarkData): GanttData {
  const sortedDates = Object.keys(data.days).sort();

  if (sortedDates.length === 0) {
    return { entities: [], lastDateStr: '' };
  }

  const groupEntities: Record<string, GanttEntity> = {};
  const standaloneEntities: Record<string, GanttEntity> = {};
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
          startMs = dayStartMs + parseInt(sTime[0], 10) * MS_PER_HOUR + parseInt(sTime[1], 10) * MS_PER_MINUTE;
        }
        if (parts[1]) {
          const eTime = parts[1].trim().split(':');
          if (eTime.length >= 2) {
            endMs = dayStartMs + parseInt(eTime[0], 10) * MS_PER_HOUR + parseInt(eTime[1], 10) * MS_PER_MINUTE;
          }
        } else {
          endMs = startMs + MS_PER_HOUR;
        }
      }

      const bucket = item.group ? groupEntities : standaloneEntities;
      const displayName = item.group ?? item.text;
      const typePrefix = item.group ? 'g' : 's';
      const key = `${typePrefix}::${dStr}::${displayName}`;
      if (!bucket[key]) {
        const groupHeaderTags = item.group ? (data.groupTags[`${dStr}::${displayName}`] ?? null) : null;
        bucket[key] = {
          id: key,
          name: displayName,
          lane: displayName,
          isGroup: !!item.group,
          minTime: startMs,
          maxTime: endMs,
          tags: groupHeaderTags ? [...groupHeaderTags] : [],
          tasksTotal: 0,
          tasksDone: 0,
          children: []
        };
      } else {
        if (startMs < bucket[key].minTime) { bucket[key].minTime = startMs; }
        if (endMs > bucket[key].maxTime) { bucket[key].maxTime = endMs; }
      }

      bucket[key].children.push({
        text: item.text,
        tags: [...item.tags],
        startMs,
        endMs,
        isTask: item.type === 'task',
        isDone: item.status === 'done'
      });

      if (item.type === 'task') {
        bucket[key].tasksTotal++;
        if (item.status === 'done') {
          bucket[key].tasksDone++;
        }
      }
    });
  });

  const entityArray = [
    ...Object.values(groupEntities),
    ...Object.values(standaloneEntities)
  ].sort(
    (a, b) => a.minTime - b.minTime || a.name.localeCompare(b.name)
  );

  return { entities: entityArray, lastDateStr };
}
