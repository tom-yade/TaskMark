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
});
