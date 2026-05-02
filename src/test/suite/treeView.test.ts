import * as assert from 'assert';
import { parseTmd } from '../../parser';
import { categorizeForTreeView, RECENTLY_DONE_LIMIT } from '../../treeView';

function getCategorized(text: string, today: string) {
  const { data } = parseTmd(text);
  return categorizeForTreeView(data, today);
}

suite('categorizeForTreeView', () => {
  test('today bucket includes items whose startDate equals today', () => {
    const text = `
# 2026-05-02
- [ ] 10:00 Meeting
- Plain schedule

# 2026-05-01
- Yesterday item
`;
    const result = getCategorized(text, '2026-05-02');
    const todayTexts = result.today.map(i => i.text);
    assert.deepStrictEqual(todayTexts.sort(), ['Meeting', 'Plain schedule'].sort());
  });

  test('today bucket includes spanning items where today is between start and end', () => {
    const text = `
# 2026-04-30 : 2026-05-05
- Long event
`;
    const result = getCategorized(text, '2026-05-02');
    assert.strictEqual(result.today.length, 1);
    assert.strictEqual(result.today[0].text, 'Long event');
  });

  test('thisWeek bucket includes items in the same Mon-Sun week excluding today', () => {
    // 2026-05-02 is a Saturday. Week (Mon-Sun) = 2026-04-27..2026-05-03.
    const text = `
# 2026-04-27
- Monday item

# 2026-05-02
- Saturday item

# 2026-05-03
- Sunday item

# 2026-05-04
- Next Monday item
`;
    const result = getCategorized(text, '2026-05-02');
    const weekTexts = result.thisWeek.map(i => i.text);
    assert.ok(weekTexts.includes('Monday item'));
    assert.ok(weekTexts.includes('Sunday item'));
    assert.ok(!weekTexts.includes('Saturday item'), 'today should be excluded from thisWeek');
    assert.ok(!weekTexts.includes('Next Monday item'), 'next week should not be in thisWeek');
  });

  test('overdue bucket includes only undone tasks before today', () => {
    const text = `
# 2026-04-25
- [ ] Old todo
- [x] Old done
- Old schedule

# 2026-05-02
- [ ] Today todo
`;
    const result = getCategorized(text, '2026-05-02');
    const overdueTexts = result.overdue.map(i => i.text);
    assert.deepStrictEqual(overdueTexts, ['Old todo']);
  });

  test('overdue uses endDate when present (an item is not overdue while its range includes today)', () => {
    const text = `
# 2026-04-30 : 2026-05-05
- [ ] Long task
`;
    const result = getCategorized(text, '2026-05-02');
    assert.strictEqual(result.overdue.length, 0, 'task whose endDate is in the future is not overdue');
  });

  test('recentlyDone returns up to RECENTLY_DONE_LIMIT done tasks, newest first', () => {
    const lines: string[] = [];
    const total = RECENTLY_DONE_LIMIT + 3;
    for (let i = 0; i < total; i++) {
      const day = String(i + 1).padStart(2, '0');
      lines.push(`# 2026-04-${day}`);
      lines.push(`- [x] done-${i}`);
      lines.push('');
    }
    const result = getCategorized(lines.join('\n'), '2026-05-02');
    assert.strictEqual(result.recentlyDone.length, RECENTLY_DONE_LIMIT);
    // Newest (largest date) first.
    assert.strictEqual(result.recentlyDone[0].text, `done-${total - 1}`);
    assert.strictEqual(
      result.recentlyDone[RECENTLY_DONE_LIMIT - 1].text,
      `done-${total - RECENTLY_DONE_LIMIT}`
    );
  });

  test('recentlyDone excludes done tasks dated in the future', () => {
    const text = `
# 2026-04-25
- [x] past done

# 2026-05-10
- [x] future done
`;
    const result = getCategorized(text, '2026-05-02');
    const texts = result.recentlyDone.map(i => i.text);
    assert.deepStrictEqual(texts, ['past done']);
  });

  test('items in today are sorted by time then by line order', () => {
    const text = `
# 2026-05-02
- 14:00 Afternoon
- 09:00 Morning
- Untimed
`;
    const result = getCategorized(text, '2026-05-02');
    const texts = result.today.map(i => i.text);
    assert.deepStrictEqual(texts, ['Morning', 'Afternoon', 'Untimed']);
  });

  test('week boundary: Monday is first day of week', () => {
    // 2026-05-04 is Monday.
    const text = `
# 2026-05-03
- Sunday previous week

# 2026-05-04
- Monday today
`;
    const result = getCategorized(text, '2026-05-04');
    const weekTexts = result.thisWeek.map(i => i.text);
    assert.ok(!weekTexts.includes('Sunday previous week'));
    // today is Monday, excluded from thisWeek.
    assert.ok(!weekTexts.includes('Monday today'));
  });

  test('returns empty buckets for an empty document', () => {
    const result = getCategorized('', '2026-05-02');
    assert.deepStrictEqual(result.today, []);
    assert.deepStrictEqual(result.thisWeek, []);
    assert.deepStrictEqual(result.overdue, []);
    assert.deepStrictEqual(result.recentlyDone, []);
  });
});
