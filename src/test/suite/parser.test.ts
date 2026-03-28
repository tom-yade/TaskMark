import * as assert from 'assert';
import { parseTmd } from '../../parser';

suite('Parser Test Suite', () => {
  test('parseTmd basically works for tasks and schedules', () => {
    const text = `
# 2026-03-26
- [ ] 09:00-10:00 Meeting
- Schedule item
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-26'], 'Day entry should be created');
    
    const items = data.days['2026-03-26'].items;
    assert.strictEqual(items.length, 2, 'Should parse 2 items');
    
    assert.strictEqual(items[0].type, 'task');
    assert.strictEqual(items[0].status, 'todo');
    assert.strictEqual(items[0].text, 'Meeting');
    
    assert.strictEqual(items[1].type, 'schedule');
    assert.strictEqual(items[1].text, 'Schedule item');
  });

  test('parseTmd parses @tags block', () => {
    const text = `
@tags
#meeting : #ff0000
#work : #0088ff
@end

# 2026-03-26
- Meeting
`;
    const data = parseTmd(text);
    assert.strictEqual(data.tagColors['meeting'], '#ff0000');
    assert.strictEqual(data.tagColors['work'], '#0088ff');
  });

  test('parseTmd @tags block does not bleed into day parsing', () => {
    const text = `
@tags
#meeting : #ff0000
@end

# 2026-03-26
- Task item
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-26'], 'Day should exist');
    assert.strictEqual(data.days['2026-03-26'].items.length, 1);
    assert.strictEqual(data.days['2026-03-26'].items[0].text, 'Task item');
  });

  test('parseTmd empty @tags block produces empty tagColors', () => {
    const text = `
@tags
@end

# 2026-03-26
- Task
`;
    const data = parseTmd(text);
    assert.deepStrictEqual(data.tagColors, {});
  });

  test('parseTmd basic repetition handling', () => {
    const text = `
# 2026-03-26
- Daily habit @repeat(daily, count:3)
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-26']);
    assert.ok(data.days['2026-03-27']);
    assert.ok(data.days['2026-03-28']);
    assert.strictEqual(Object.keys(data.days).length, 3, 'Should create 3 days of repeatable task');
  });

  test('parseTmd repeat except skips specified date', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:3, except:2026-03-23)
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-16'], '2026-03-16 should exist');
    assert.ok(!data.days['2026-03-23'], '2026-03-23 should be skipped');
    assert.ok(data.days['2026-03-30'], '2026-03-30 should still exist');
  });

  test('parseTmd repeat except ignores invalid dates', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:3, except:2026-02-30)
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-23'], '2026-03-23 should exist because except date was invalid');
    assert.ok(data.days['2026-03-30'], '2026-03-30 should exist');
  });

  test('parseTmd repeat except skips multiple specified dates', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:4, except:2026-03-23 2026-03-30)
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-16'], '2026-03-16 should exist');
    assert.ok(!data.days['2026-03-23'], '2026-03-23 should be skipped');
    assert.ok(!data.days['2026-03-30'], '2026-03-30 should be skipped');
    assert.ok(data.days['2026-04-06'], '2026-04-06 should still exist');
  });

  test('parseTmd date range header sets endDate on items', () => {
    const text = `
# 2026-03-01 : 2026-03-10
- Conference #Work
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-01'], 'Start day should exist');
    assert.ok(!data.days['2026-03-10'], 'End day should NOT be a separate entry');

    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, '2026-03-10');
  });

  test('parseTmd single date header does not set endDate', () => {
    const text = `
# 2026-03-01
- Regular item
`;
    const data = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd date range with task sets endDate', () => {
    const text = `
# 2026-03-01 : 2026-03-05
- [ ] Multi-day task
`;
    const data = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].type, 'task');
    assert.strictEqual(items[0].endDate, '2026-03-05');
  });

  test('parseTmd date range with invalid end date falls back to single date', () => {
    const text = `
# 2026-03-01 : 2026-02-30
- Conference
`;
    const data = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd date range where end date is before start date is ignored', () => {
    const text = `
# 2026-03-10 : 2026-03-01
- Conference
`;
    const data = parseTmd(text);
    const items = data.days['2026-03-10'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd endDate takes priority over @repeat: repeat is not expanded', () => {
    const text = `
# 2026-03-01 : 2026-03-10
- Daily standup @repeat(daily, count:5)
`;
    const data = parseTmd(text);
    assert.strictEqual(Object.keys(data.days).length, 1, 'Only start day should exist');
    assert.ok(data.days['2026-03-01'], 'Start day should exist');
    assert.ok(!data.days['2026-03-02'], 'Repeat should not expand when endDate is set');
  });

  test('parseTmd date header without zero-padding is normalized and parsed', () => {
    const text = `
# 2026-3-1
- Meeting
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-01'], 'Day should be stored with zero-padded key');
    assert.strictEqual(data.days['2026-03-01'].items.length, 1);
    assert.strictEqual(data.days['2026-03-01'].items[0].text, 'Meeting');
  });

  test('parseTmd date range end date without zero-padding is normalized', () => {
    const text = `
# 2026-3-1 : 2026-3-10
- Conference
`;
    const data = parseTmd(text);
    assert.ok(data.days['2026-03-01'], 'Start day should be zero-padded');
    assert.strictEqual(data.days['2026-03-01'].items[0].endDate, '2026-03-10');
  });

  test('parseTmd date header with invalid month is ignored', () => {
    const text = `
# 2026-13-1
- Meeting
`;
    const data = parseTmd(text);
    assert.strictEqual(Object.keys(data.days).length, 0, 'Invalid date header should be ignored');
  });
});
