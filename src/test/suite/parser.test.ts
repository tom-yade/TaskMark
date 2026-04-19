import * as assert from 'assert';
import { parseTmd } from '../../parser';

suite('Parser Test Suite', () => {
  test('parseTmd returns ParseResult with data and warnings', () => {
    const text = `
# 2026-03-26
- Meeting
`;
    const result = parseTmd(text);
    assert.ok('data' in result, 'Result should have data field');
    assert.ok('warnings' in result, 'Result should have warnings field');
    assert.ok(Array.isArray(result.warnings), 'warnings should be an array');
  });

  test('parseTmd distinguishes timed task lines from plain schedule lines', () => {
    const text = `
# 2026-03-26
- [ ] 09:00-10:00 Meeting
- Schedule item
`;
    const { data } = parseTmd(text);
    assert.ok(data.days['2026-03-26'], 'Day entry should be created');

    const items = data.days['2026-03-26'].items;
    assert.strictEqual(items.length, 2, 'Should parse 2 items');

    assert.strictEqual(items[0].type, 'task');
    assert.strictEqual(items[0].status, 'todo');
    assert.strictEqual(items[0].text, 'Meeting');
    assert.strictEqual(items[0].sourceLine, '- [ ] 09:00-10:00 Meeting');

    assert.strictEqual(items[1].type, 'schedule');
    assert.strictEqual(items[1].text, 'Schedule item');
    assert.strictEqual(items[1].sourceLine, '- Schedule item');
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
    const { data } = parseTmd(text);
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
    const { data } = parseTmd(text);
    assert.ok(data.days['2026-03-26'], 'Day should exist');
    assert.strictEqual(data.days['2026-03-26'].items.length, 1);
    assert.strictEqual(data.days['2026-03-26'].items[0].text, 'Task item');
  });

  test('parseTmd @repeat count expands the item into that many consecutive days', () => {
    const text = `
# 2026-03-26
- Daily habit @repeat(daily, count:3)
`;
    const { data } = parseTmd(text);
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
    const { data } = parseTmd(text);
    assert.ok(data.days['2026-03-16'], '2026-03-16 should exist');
    assert.ok(!data.days['2026-03-23'], '2026-03-23 should be skipped');
    assert.ok(data.days['2026-03-30'], '2026-03-30 should still exist');
  });

  test('parseTmd repeat except ignores invalid dates', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:3, except:2026-02-30)
`;
    const { data } = parseTmd(text);
    assert.ok(data.days['2026-03-23'], '2026-03-23 should exist because except date was invalid');
    assert.ok(data.days['2026-03-30'], '2026-03-30 should exist');
  });

  test('parseTmd repeat except skips multiple specified dates', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:4, except:2026-03-23 2026-03-30)
`;
    const { data } = parseTmd(text);
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
    const { data } = parseTmd(text);
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
    const { data } = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd date range with task sets endDate', () => {
    const text = `
# 2026-03-01 : 2026-03-05
- [ ] Multi-day task
`;
    const { data } = parseTmd(text);
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
    const { data } = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd date range where end date is before start date is ignored', () => {
    const text = `
# 2026-03-10 : 2026-03-01
- Conference
`;
    const { data } = parseTmd(text);
    const items = data.days['2026-03-10'].items;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].endDate, undefined);
  });

  test('parseTmd endDate takes priority over @repeat: repeat is not expanded', () => {
    const text = `
# 2026-03-01 : 2026-03-10
- Daily standup @repeat(daily, count:5)
`;
    const { data } = parseTmd(text);
    assert.strictEqual(Object.keys(data.days).length, 1, 'Only start day should exist');
    assert.ok(data.days['2026-03-01'], 'Start day should exist');
    assert.ok(!data.days['2026-03-02'], 'Repeat should not expand when endDate is set');
  });

  test('parseTmd normalizes unpadded dates and times across every position', () => {
    // All positions that accept a date or time string should normalize
    // unpadded forms (e.g. `2026-3-1`, `9:0`) to zero-padded forms.
    const cases: Array<{ label: string; text: string; check: (data: ReturnType<typeof parseTmd>['data']) => void }> = [
      {
        label: 'date header',
        text: `
# 2026-3-1
- Meeting
`,
        check: data => {
          assert.ok(data.days['2026-03-01'], 'day stored under zero-padded key');
          assert.strictEqual(data.days['2026-03-01'].items[0].text, 'Meeting');
        },
      },
      {
        label: 'date range end date',
        text: `
# 2026-3-1 : 2026-3-10
- Conference
`,
        check: data => {
          assert.ok(data.days['2026-03-01']);
          assert.strictEqual(data.days['2026-03-01'].items[0].endDate, '2026-03-10');
        },
      },
      {
        label: 'time range with unpadded minutes',
        text: `
# 2026-03-01
- 9:0-17:0 Conference
`,
        check: data => {
          assert.strictEqual(data.days['2026-03-01'].items[0].time, '9:00-17:00');
        },
      },
      {
        label: 'start-only time with unpadded minutes',
        text: `
# 2026-03-01
- 9:0 Meeting
`,
        check: data => {
          assert.strictEqual(data.days['2026-03-01'].items[0].time, '9:00');
        },
      },
      {
        label: 'repeat except with unpadded date',
        text: `
# 2026-03-16
- Weekly Sync @repeat(weekly, count:3, except:2026-3-23)
`,
        check: data => {
          assert.ok(data.days['2026-03-16']);
          assert.ok(!data.days['2026-03-23'], '2026-03-23 should be skipped');
          assert.ok(data.days['2026-03-30']);
        },
      },
    ];

    for (const c of cases) {
      const { data } = parseTmd(c.text);
      try {
        c.check(data);
      } catch (e) {
        // Preserve the original assertion's stack trace so the failing
        // `assert` line stays visible; only prefix the message with the case label.
        if (e instanceof Error) {
          e.message = `case "${c.label}" failed: ${e.message}`;
        }
        throw e;
      }
    }
  });

  test('parseTmd date header with invalid month is ignored', () => {
    const text = `
# 2026-13-1
- Meeting
`;
    const { data } = parseTmd(text);
    assert.strictEqual(Object.keys(data.days).length, 0, 'Invalid date header should be ignored');
  });

  // ─── Warning Collection Tests ────────────────────────────────

  test('parseTmd returns no warnings for valid input', () => {
    const text = `
# 2026-03-26
- Meeting
- [ ] Task
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 0, 'Should have no warnings for valid input');
  });

  test('parseTmd warns on invalid date header', () => {
    const text = `
# 2026-99-99
- Meeting
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning');
    assert.ok(warnings[0].includes('Line 2'), 'Warning should reference line number');
    assert.ok(warnings[0].includes('2026-99-99'), 'Warning should include the invalid date');
  });

  test('parseTmd warns on invalid end date in range header', () => {
    const text = `
# 2026-03-01 : 2026-02-30
- Conference
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning');
    assert.ok(warnings[0].includes('2026-02-30'), 'Warning should include the invalid end date');
  });

  test('parseTmd warns when end date is before start date', () => {
    const text = `
# 2026-03-10 : 2026-03-01
- Conference
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning');
    assert.ok(warnings[0].includes('2026-03-01'), 'Warning should include the end date');
  });

  test('parseTmd warns on invalid until date in @repeat and does not throw', () => {
    const text = `
# 2026-03-16
- 10:00-11:00 Weekly Sync @repeat(weekly, count:3, until:2026-02-30)
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning');
    assert.ok(warnings[0].includes('2026-02-30'), 'Warning should include the invalid until date');
    assert.ok(data.days['2026-03-16'], 'Origin item should still exist');
    // Invalid until is ignored, so count:3 controls expansion
    assert.strictEqual(Object.keys(data.days).length, 3, 'Should expand based on count when until is invalid');
  });

  test('parseTmd repeat until with unpadded date works correctly', () => {
    const text = `
# 2026-03-16
- Weekly Sync @repeat(weekly, until:2026-4-6)
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 0, 'Unpadded until date should not produce warnings');
    assert.ok(data.days['2026-03-16'], '2026-03-16 should exist');
    assert.ok(data.days['2026-03-23'], '2026-03-23 should exist');
    assert.ok(data.days['2026-03-30'], '2026-03-30 should exist');
    assert.ok(!data.days['2026-04-13'], '2026-04-13 should not exist (past until)');
  });

  test('parseTmd warns on invalid except date in @repeat', () => {
    const text = `
# 2026-03-16
- Weekly Sync @repeat(weekly, count:3, except:2026-02-30)
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning for invalid except date');
    assert.ok(warnings[0].includes('2026-02-30'), 'Warning should include the invalid except date');
    // Invalid except date is ignored, so all 3 days still exist
    assert.strictEqual(Object.keys(data.days).length, 3);
  });

  test('parseTmd warns on invalid line inside @tags block', () => {
    const text = `
@tags
#meeting : #ff0000
not a valid tag line
#work : #0088ff
@end

# 2026-03-01
- Meeting
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should have one warning');
    assert.ok(warnings[0].includes('Line 4'), 'Warning should reference the correct line');
    assert.strictEqual(data.tagColors['meeting'], '#ff0000', 'Valid tags should still parse');
    assert.strictEqual(data.tagColors['work'], '#0088ff', 'Valid tags should still parse');
  });

  test('parseTmd rejects CSS injection in tag color values', () => {
    const text = `
@tags
#valid : #ff0000
#inject1 : red; background-image: url(evil)
#inject2 : #fff} .x{color:red
#inject3 : expression(alert(1))
#named : steelblue
#rgb : rgb(255, 0, 128)
#hsl : hsl(120, 50%, 50%)
#rgba : rgba(0, 0, 0, 0.5)
#hsla : hsla(120, 50%, 50%, 0.8)
@end

# 2026-03-01
- Task
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(data.tagColors['valid'], '#ff0000', 'Valid hex color accepted');
    assert.strictEqual(data.tagColors['named'], 'steelblue', 'Valid named color accepted');
    assert.strictEqual(data.tagColors['rgb'], 'rgb(255, 0, 128)', 'Valid rgb() accepted');
    assert.strictEqual(data.tagColors['hsl'], 'hsl(120, 50%, 50%)', 'Valid hsl() accepted');
    assert.strictEqual(data.tagColors['rgba'], 'rgba(0, 0, 0, 0.5)', 'Valid rgba() accepted');
    assert.strictEqual(data.tagColors['hsla'], 'hsla(120, 50%, 50%, 0.8)', 'Valid hsla() accepted');
    assert.strictEqual(data.tagColors['inject1'], undefined, 'Semicolon injection rejected');
    assert.strictEqual(data.tagColors['inject2'], undefined, 'Brace injection rejected');
    assert.strictEqual(data.tagColors['inject3'], undefined, 'expression() injection rejected');
    assert.strictEqual(warnings.length, 3, 'Should warn for each rejected color');
  });

  test('parseTmd validates hex color digit counts', () => {
    const text = `
@tags
#h3 : #fff
#h4 : #ffff
#h6 : #ffffff
#h8 : #ffffffff
#h1 : #f
#h2 : #ff
#h5 : #fffff
#h7 : #fffffff
@end

# 2026-03-01
- Task
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(data.tagColors['h3'], '#fff', '3-digit hex accepted');
    assert.strictEqual(data.tagColors['h4'], '#ffff', '4-digit hex accepted');
    assert.strictEqual(data.tagColors['h6'], '#ffffff', '6-digit hex accepted');
    assert.strictEqual(data.tagColors['h8'], '#ffffffff', '8-digit hex accepted');
    assert.strictEqual(data.tagColors['h1'], undefined, '1-digit hex rejected');
    assert.strictEqual(data.tagColors['h2'], undefined, '2-digit hex rejected');
    assert.strictEqual(data.tagColors['h5'], undefined, '5-digit hex rejected');
    assert.strictEqual(data.tagColors['h7'], undefined, '7-digit hex rejected');
    assert.strictEqual(warnings.length, 4, 'Should warn for each invalid hex length');
  });

  test('parseTmd rejects malformed rgb/hsl values', () => {
    const text = `
@tags
#ok1 : rgb(255, 0, 128)
#ok2 : rgb(255 0 128 / 0.5)
#bad1 : rgb()
#bad2 : rgb(,,,)
#bad3 : rgb(a, b, c)
@end

# 2026-03-01
- Task
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(data.tagColors['ok1'], 'rgb(255, 0, 128)', 'Valid rgb() accepted');
    assert.strictEqual(data.tagColors['ok2'], 'rgb(255 0 128 / 0.5)', 'Modern rgb() with alpha accepted');
    assert.strictEqual(data.tagColors['bad1'], undefined, 'Empty rgb() rejected');
    assert.strictEqual(data.tagColors['bad2'], undefined, 'Comma-only rgb() rejected');
    assert.strictEqual(data.tagColors['bad3'], undefined, 'Non-numeric rgb() rejected');
    assert.strictEqual(warnings.length, 3, 'Should warn for each invalid rgb');
  });

  test('parseTmd collects multiple warnings', () => {
    const text = `
# 2026-99-99
- Item under invalid date
# 2026-03-01
- Valid item
# 2026-13-01
- Another item under invalid date
`;
    const { data, warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 2, 'Should have two warnings');
    assert.ok(data.days['2026-03-01'], 'Valid date should still parse');
  });

  test('parseTmd deduplicates identical warnings', () => {
    const text = `
# 2026-03-01
- Weekly @repeat(weekly, count:3, except:2026-99-99 2026-99-99)
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'identical warnings should be deduplicated to one');
    assert.match(warnings[0], /invalid except date '2026-99-99'/);
  });

  // ─── Group Tags Tests ────────────────────────────────────────

  test('parseTmd group header with tag stores groupTags entry', () => {
    const text = `
# 2026-03-01
> Sprint #backend
> - [ ] Task A
`;
    const { data } = parseTmd(text);
    assert.deepStrictEqual(data.groupTags['2026-03-01::Sprint'], ['backend']);
  });

  test('parseTmd group header without tag produces no groupTags entry', () => {
    const text = `
# 2026-03-01
> Sprint
> - [ ] Task A
`;
    const { data } = parseTmd(text);
    assert.strictEqual(data.groupTags['2026-03-01::Sprint'], undefined);
  });

  test('parseTmd group header tag is stripped from group name', () => {
    const text = `
# 2026-03-01
> Sprint #backend
> - [ ] Task A
`;
    const { data } = parseTmd(text);
    const items = data.days['2026-03-01'].items;
    assert.strictEqual(items[0].group, 'Sprint', 'group name should not include the tag');
  });

  test('parseTmd group header with multiple tags stores all tags', () => {
    const text = `
# 2026-03-01
> Sprint #backend #mobile
> - [ ] Task A
`;
    const { data } = parseTmd(text);
    assert.deepStrictEqual(data.groupTags['2026-03-01::Sprint'], ['backend', 'mobile']);
  });

  test('parseTmd warns when group header has only tags and no group name', () => {
    const text = `
# 2026-03-01
> #backend
> - [ ] Task A
`;
    const { warnings } = parseTmd(text);
    assert.strictEqual(warnings.length, 1, 'Should warn for empty group name');
    assert.ok(warnings[0].includes('Line 3'), 'Warning should reference line number');
  });

  test('parseTmd item has startDate matching the date header', () => {
    const text = `
# 2026-03-01
- Meeting
`;
    const { data } = parseTmd(text);
    const item = data.days['2026-03-01'].items[0];
    assert.strictEqual(item.startDate, '2026-03-01');
  });

  test('parseTmd range item has startDate matching the range start date', () => {
    const text = `
# 2026-03-01 : 2026-03-10
> Sprint #backend
> - [ ] Task A
`;
    const { data } = parseTmd(text);
    const item = data.days['2026-03-01'].items[0];
    assert.strictEqual(item.startDate, '2026-03-01');
  });
});
