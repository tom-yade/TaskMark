import * as assert from 'assert';
import {
  parseDuplicatePattern,
  parseDuplicateEndCondition,
  generateDuplicateDates,
  duplicateTaskAcrossDates,
  findSourceDateForLine,
} from '../../duplicateTask';

suite('Duplicate Task Test Suite', () => {
  suite('parseDuplicatePattern', () => {
    test('parses preset keywords', () => {
      assert.deepStrictEqual(parseDuplicatePattern('daily'), { mode: 'days', interval: 1 });
      assert.deepStrictEqual(parseDuplicatePattern('weekly'), { mode: 'days', interval: 7 });
      assert.deepStrictEqual(parseDuplicatePattern('monthly'), { mode: 'months', interval: 1 });
    });

    test('parses every:Ndays / Nweeks / Nmonths', () => {
      assert.deepStrictEqual(parseDuplicatePattern('every:3days'), { mode: 'days', interval: 3 });
      assert.deepStrictEqual(parseDuplicatePattern('every:2weeks'), { mode: 'days', interval: 14 });
      assert.deepStrictEqual(parseDuplicatePattern('every:3months'), { mode: 'months', interval: 3 });
    });

    test('trims surrounding whitespace', () => {
      assert.deepStrictEqual(parseDuplicatePattern('  weekly  '), { mode: 'days', interval: 7 });
    });

    test('rejects invalid input', () => {
      assert.strictEqual(parseDuplicatePattern(''), null);
      assert.strictEqual(parseDuplicatePattern('yearly'), null);
      assert.strictEqual(parseDuplicatePattern('every:0days'), null);
      assert.strictEqual(parseDuplicatePattern('every:-1days'), null);
      assert.strictEqual(parseDuplicatePattern('every:days'), null);
      assert.strictEqual(parseDuplicatePattern('every:3'), null);
    });
  });

  suite('parseDuplicateEndCondition', () => {
    test('parses count:N', () => {
      assert.deepStrictEqual(parseDuplicateEndCondition('count:5'), { kind: 'count', count: 5 });
      assert.deepStrictEqual(parseDuplicateEndCondition('count:1'), { kind: 'count', count: 1 });
    });

    test('parses until:YYYY-MM-DD', () => {
      assert.deepStrictEqual(
        parseDuplicateEndCondition('until:2026-12-31'),
        { kind: 'until', until: '2026-12-31' }
      );
    });

    test('rejects invalid input', () => {
      assert.strictEqual(parseDuplicateEndCondition(''), null);
      assert.strictEqual(parseDuplicateEndCondition('count:0'), null);
      assert.strictEqual(parseDuplicateEndCondition('count:-1'), null);
      assert.strictEqual(parseDuplicateEndCondition('count:abc'), null);
      assert.strictEqual(parseDuplicateEndCondition('until:2026-13-01'), null);
      assert.strictEqual(parseDuplicateEndCondition('until:not-a-date'), null);
      assert.strictEqual(parseDuplicateEndCondition('forever'), null);
    });

    test('caps count at maximum occurrences', () => {
      const r = parseDuplicateEndCondition('count:99999');
      assert.ok(r);
      assert.strictEqual(r!.kind, 'count');
      assert.strictEqual(r!.count, 3650);
    });
  });

  suite('generateDuplicateDates', () => {
    test('daily count:4 yields three additional dates', () => {
      const dates = generateDuplicateDates(
        '2026-04-27',
        { mode: 'days', interval: 1 },
        { kind: 'count', count: 4 }
      );
      assert.deepStrictEqual(dates, ['2026-04-28', '2026-04-29', '2026-04-30']);
    });

    test('weekly count:4 follows the issue example', () => {
      const dates = generateDuplicateDates(
        '2026-04-27',
        { mode: 'days', interval: 7 },
        { kind: 'count', count: 4 }
      );
      assert.deepStrictEqual(dates, ['2026-05-04', '2026-05-11', '2026-05-18']);
    });

    test('monthly clamps to last day for short months', () => {
      const dates = generateDuplicateDates(
        '2026-01-31',
        { mode: 'months', interval: 1 },
        { kind: 'count', count: 3 }
      );
      assert.deepStrictEqual(dates, ['2026-02-28', '2026-03-31']);
    });

    test('every:2days with count', () => {
      const dates = generateDuplicateDates(
        '2026-04-27',
        { mode: 'days', interval: 2 },
        { kind: 'count', count: 3 }
      );
      assert.deepStrictEqual(dates, ['2026-04-29', '2026-05-01']);
    });

    test('until stops at the given date inclusive', () => {
      const dates = generateDuplicateDates(
        '2026-04-27',
        { mode: 'days', interval: 7 },
        { kind: 'until', until: '2026-05-18' }
      );
      assert.deepStrictEqual(dates, ['2026-05-04', '2026-05-11', '2026-05-18']);
    });

    test('until on or before source date yields empty', () => {
      assert.deepStrictEqual(
        generateDuplicateDates(
          '2026-04-27',
          { mode: 'days', interval: 7 },
          { kind: 'until', until: '2026-04-27' }
        ),
        []
      );
      assert.deepStrictEqual(
        generateDuplicateDates(
          '2026-04-27',
          { mode: 'days', interval: 7 },
          { kind: 'until', until: '2026-05-03' }
        ),
        []
      );
    });

    test('count:1 yields no additional dates', () => {
      assert.deepStrictEqual(
        generateDuplicateDates(
          '2026-04-27',
          { mode: 'days', interval: 7 },
          { kind: 'count', count: 1 }
        ),
        []
      );
    });
  });

  suite('duplicateTaskAcrossDates', () => {
    test('inserts copies into new sections following the issue example', () => {
      const text = ['# 2026-04-27', '- [ ] Weekly Report'].join('\n');
      const { newText, insertedDates } = duplicateTaskAcrossDates(
        text,
        '2026-04-27',
        '- [ ] Weekly Report',
        { mode: 'days', interval: 7 },
        { kind: 'count', count: 4 }
      );

      assert.deepStrictEqual(insertedDates, ['2026-05-04', '2026-05-11', '2026-05-18']);
      assert.strictEqual(
        newText,
        [
          '# 2026-04-27',
          '- [ ] Weekly Report',
          '',
          '# 2026-05-04',
          '- [ ] Weekly Report',
          '',
          '# 2026-05-11',
          '- [ ] Weekly Report',
          '',
          '# 2026-05-18',
          '- [ ] Weekly Report',
        ].join('\n')
      );
    });

    test('appends to an existing target section instead of creating a new one', () => {
      const text = [
        '# 2026-04-27',
        '- [ ] Weekly Report',
        '',
        '# 2026-05-04',
        '- 10:00 Other',
      ].join('\n');
      const { newText } = duplicateTaskAcrossDates(
        text,
        '2026-04-27',
        '- [ ] Weekly Report',
        { mode: 'days', interval: 7 },
        { kind: 'count', count: 2 }
      );

      assert.strictEqual(
        newText,
        [
          '# 2026-04-27',
          '- [ ] Weekly Report',
          '',
          '# 2026-05-04',
          '- 10:00 Other',
          '- [ ] Weekly Report',
        ].join('\n')
      );
    });

    test('preserves CRLF line endings', () => {
      const text = ['# 2026-04-27', '- [ ] Weekly Report'].join('\r\n');
      const { newText } = duplicateTaskAcrossDates(
        text,
        '2026-04-27',
        '- [ ] Weekly Report',
        { mode: 'days', interval: 7 },
        { kind: 'count', count: 2 },
        '\r\n'
      );

      assert.ok(!/(?<!\r)\n/.test(newText), 'should not contain bare \\n');
      assert.ok(newText.includes('\r\n# 2026-05-04\r\n- [ ] Weekly Report'));
    });

    test('returns the original text unchanged when count:1', () => {
      const text = ['# 2026-04-27', '- [ ] Weekly Report'].join('\n');
      const { newText, insertedDates } = duplicateTaskAcrossDates(
        text,
        '2026-04-27',
        '- [ ] Weekly Report',
        { mode: 'days', interval: 7 },
        { kind: 'count', count: 1 }
      );
      assert.strictEqual(newText, text);
      assert.deepStrictEqual(insertedDates, []);
    });
  });

  suite('findSourceDateForLine', () => {
    test('finds the nearest preceding date header', () => {
      const text = [
        '# 2026-04-27',
        '- [ ] A',
        '- [ ] B',
        '',
        '# 2026-05-04',
        '- [ ] C',
      ].join('\n');
      assert.strictEqual(findSourceDateForLine(text, 1), '2026-04-27');
      assert.strictEqual(findSourceDateForLine(text, 2), '2026-04-27');
      assert.strictEqual(findSourceDateForLine(text, 5), '2026-05-04');
    });

    test('normalizes single-digit month/day', () => {
      const text = ['# 2026-3-5', '- [ ] A'].join('\n');
      assert.strictEqual(findSourceDateForLine(text, 1), '2026-03-05');
    });

    test('returns null when no date header precedes the line', () => {
      const text = ['- [ ] A', '- [ ] B'].join('\n');
      assert.strictEqual(findSourceDateForLine(text, 0), null);
      assert.strictEqual(findSourceDateForLine(text, 1), null);
    });
  });
});
