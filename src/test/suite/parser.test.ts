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
});
