import * as assert from 'assert';
import { buildGanttEntities } from '../../gantt';
import { parseTmd } from '../../parser';

suite('Gantt Test Suite', () => {
  test('group entity has children with text and tags', () => {
    const { data } = parseTmd(`# 2026-03-01
> Sprint 1
> - [ ] Task A #work
> - [x] Task B
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 1);

    const group = entities[0];
    assert.strictEqual(group.isGroup, true);
    assert.strictEqual(group.name, 'Sprint 1');
    assert.strictEqual(group.children.length, 2);

    assert.strictEqual(group.children[0].text, 'Task A');
    assert.strictEqual(group.children[0].isTask, true);
    assert.strictEqual(group.children[0].isDone, false);
    assert.deepStrictEqual(group.children[0].tags, ['work']);

    assert.strictEqual(group.children[1].text, 'Task B');
    assert.strictEqual(group.children[1].isTask, true);
    assert.strictEqual(group.children[1].isDone, true);
  });

  test('standalone task entity has a children array with one entry', () => {
    const { data } = parseTmd(`
# 2026-03-01
- [ ] Standalone Task
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 1);

    const entity = entities[0];
    assert.strictEqual(entity.isGroup, false);
    assert.strictEqual(entity.name, 'Standalone Task');
    assert.strictEqual(entity.children.length, 1);
    assert.strictEqual(entity.children[0].text, 'Standalone Task');
    assert.strictEqual(entity.children[0].isTask, true);
  });

  test('group entity tracks task completion counters', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Group
> - [ ] Open Task
> - [x] Done Task
`);
    const { entities } = buildGanttEntities(data);
    const group = entities[0];
    assert.strictEqual(group.tasksTotal, 2);
    assert.strictEqual(group.tasksDone, 1);
  });

  test('empty data returns empty entities and empty lastDateStr', () => {
    const { entities, lastDateStr } = buildGanttEntities({ tagColors: {}, groupTags: {}, days: {} });
    assert.strictEqual(entities.length, 0);
    assert.strictEqual(lastDateStr, '');
  });

  test('lastDateStr accounts for endDate ranges', () => {
    const { data } = parseTmd(`
# 2026-03-01 : 2026-03-15
- Conference
`);
    const { lastDateStr } = buildGanttEntities(data);
    assert.strictEqual(lastDateStr, '2026-03-15');
  });

  test('multiple groups produce one entity per group', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Group A
> - [ ] Task 1
> - [ ] Task 2

> Group B
> - [x] Task 3
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2);

    const groupA = entities.find(e => e.name === 'Group A');
    assert.ok(groupA, 'Group A should exist');
    assert.strictEqual(groupA!.children.length, 2);

    const groupB = entities.find(e => e.name === 'Group B');
    assert.ok(groupB, 'Group B should exist');
    assert.strictEqual(groupB!.children.length, 1);
    assert.strictEqual(groupB!.children[0].isDone, true);
  });

  test('schedule item inside group is included in children but not counted as task', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] Task Item
> - Schedule Item
`);
    const { entities } = buildGanttEntities(data);
    const group = entities[0];
    assert.strictEqual(group.children.length, 2);
    assert.strictEqual(group.tasksTotal, 1, 'only the task should count toward tasksTotal');
    assert.strictEqual(group.children[1].isTask, false);
    assert.strictEqual(group.children[1].text, 'Schedule Item');
  });

  test('lastDateStr is the last date when no endDate ranges are present', () => {
    const { data } = parseTmd(`
# 2026-03-01
- [ ] First Task

# 2026-03-10
- [ ] Last Task
`);
    const { lastDateStr } = buildGanttEntities(data);
    assert.strictEqual(lastDateStr, '2026-03-10');
  });

  test('group name and standalone task with the same name do not collide', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] Task A

- [ ] Sprint
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2, 'group and standalone task with the same name must be separate entities');

    const group = entities.find(e => e.isGroup);
    const standalone = entities.find(e => !e.isGroup);
    assert.ok(group, 'group entity should exist');
    assert.ok(standalone, 'standalone entity should exist');
    assert.strictEqual(group!.name, 'Sprint');
    assert.strictEqual(standalone!.name, 'Sprint');
  });

  test('same-named groups in different date sections produce separate entities each with correct time range', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] 9:00-10:00 Morning Task

# 2026-03-03
> Sprint
> - [ ] 14:00-15:00 Afternoon Task
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2, 'same-named groups in different date sections must be separate entities');

    assert.ok(entities.every(e => e.lane === 'Sprint'), 'all entities should share the Sprint lane');
    assert.strictEqual(entities[0].children.length, 1);
    assert.strictEqual(entities[1].children.length, 1);
    assert.ok(entities[0].minTime < entities[1].minTime, 'entities should be ordered by start time');
    assert.ok(entities[0].minTime < entities[0].maxTime, 'each entity minTime should be before maxTime');
  });

  test('range item child spans correct time in gantt entity', () => {
    const { data } = parseTmd(`
# 2026-03-01 : 2026-03-05
- Conference
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 1);

    const entity = entities[0];
    assert.strictEqual(entity.name, 'Conference');
    assert.strictEqual(entity.children.length, 1);

    const child = entity.children[0];
    const expectedStart = new Date(2026, 2, 1).getTime();
    const expectedEnd = new Date(2026, 2, 6).getTime() - 1;

    assert.strictEqual(child.startMs, expectedStart);
    assert.strictEqual(child.endMs, expectedEnd);
    assert.strictEqual(entity.minTime, expectedStart);
    assert.strictEqual(entity.maxTime, expectedEnd);
  });

  test('range items from different weeks each produce a separate child in gantt', () => {
    const { data } = parseTmd(`
# 2026-03-01 : 2026-03-03
- Workshop A

# 2026-03-10 : 2026-03-12
- Workshop B
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2);

    const workshopA = entities.find(e => e.name === 'Workshop A');
    const workshopB = entities.find(e => e.name === 'Workshop B');
    assert.ok(workshopA, 'Workshop A entity should exist');
    assert.ok(workshopB, 'Workshop B entity should exist');
    assert.ok(workshopA!.minTime < workshopB!.minTime, 'Workshop A should start before Workshop B');
  });

  test('grouped range items merge into one entity per group in gantt', () => {
    const { data } = parseTmd(`
# 2026-03-01 : 2026-03-05
> Sprint
> - [ ] Task A
> - [ ] Task B
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 1, 'both group range items should merge into one entity');

    const sprint = entities[0];
    assert.strictEqual(sprint.isGroup, true);
    assert.strictEqual(sprint.name, 'Sprint');
    assert.strictEqual(sprint.children.length, 2);
    assert.strictEqual(sprint.tasksTotal, 2);
  });

  test('grouped range items across different date sections merge into one entity per group', () => {
    const { data } = parseTmd(`
# 2026-03-01 : 2026-03-05
> Sprint
> - [ ] Task A

# 2026-03-03 : 2026-03-07
> Sprint
> - [ ] Task B
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2, 'same group across different date ranges should produce separate entities');

    assert.ok(entities.every(e => e.name === 'Sprint'), 'all entities should be named Sprint');
    assert.ok(entities.every(e => e.lane === 'Sprint'), 'all entities should be on the Sprint lane');
    assert.notStrictEqual(entities[0].id, entities[1].id, 'entities should have different ids');
    assert.strictEqual(entities[0].children.length, 1);
    assert.strictEqual(entities[1].children.length, 1);
  });

  test('same-named groups in different date sections produce separate entities on the same lane', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] Task A

# 2026-03-10
> Sprint
> - [ ] Task B
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2, 'same-named groups across date sections should be separate entities');

    assert.ok(entities.every(e => e.lane === 'Sprint'), 'all entities should share the Sprint lane');
    assert.notStrictEqual(entities[0].id, entities[1].id, 'entities should have unique ids');
    assert.strictEqual(entities[0].tasksTotal, 1, 'first entity task count should be independent');
    assert.strictEqual(entities[1].tasksTotal, 1, 'second entity task count should be independent');
  });

  test('entity has id and lane fields', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] Task A
`);
    const { entities } = buildGanttEntities(data);
    assert.ok(entities[0].id, 'entity should have an id');
    assert.strictEqual(entities[0].lane, 'Sprint');
    assert.strictEqual(entities[0].name, 'Sprint');
  });

  test('group entity uses group-header tags when present', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint #backend
> - [ ] Task A #frontend
`);
    const { entities } = buildGanttEntities(data);
    const group = entities[0];
    assert.deepStrictEqual(group.tags, ['backend'], 'group entity should use the group header tags, not child item tags');
  });

  test('group entity has empty tags when no group-header tags', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint
> - [ ] Task A #frontend
`);
    const { entities } = buildGanttEntities(data);
    const group = entities[0];
    assert.deepStrictEqual(group.tags, [], 'group entity should have no tags when group header has no tags');
  });

  test('group entity with header tags ignores empty child tags', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint #design
> - [ ] Task A
> - [ ] Task B
`);
    const { entities } = buildGanttEntities(data);
    const group = entities[0];
    assert.deepStrictEqual(group.tags, ['design'], 'group entity should use header tags even when children have no tags');
  });

  test('repeat-expanded group entity inherits group-header tags from original date', () => {
    const { data } = parseTmd(`
# 2026-03-01
> Sprint #backend
> - 9:00-10:00 Daily Standup @repeat(weekly, count:2)
`);
    const { entities } = buildGanttEntities(data);
    assert.strictEqual(entities.length, 2, 'should produce two entities');
    entities.forEach(entity => {
      assert.deepStrictEqual(entity.tags, ['backend'], 'repeat-expanded entity should use group header tags from original date');
    });
  });

  test('standalone task entity uses its own tags', () => {
    const { data } = parseTmd(`
# 2026-03-01
- [ ] Lone Task #urgent
`);
    const { entities } = buildGanttEntities(data);
    assert.deepStrictEqual(entities[0].tags, ['urgent'], 'standalone entity should use its own tags');
  });
});
