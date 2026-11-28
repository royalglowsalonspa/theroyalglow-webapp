import { expect, test } from 'bun:test'
import { parseStatementCsv, STATEMENT_CSV_HEADER } from '../src/statement-csv'

const parse = (lines: string) =>
  parseStatementCsv(`${STATEMENT_CSV_HEADER}\n${lines}`, 'branch-1', '2026-11-27')

test('reads normalized credits and debits in exact paise', () => {
  const result = parseStatementCsv(
    `\uFEFF${STATEMENT_CSV_HEADER}\r\n"branch-1",2026-11-27,abc1,credit,190015\r\nbranch-1,2026-11-27,BANK-123,debit,1000\r\n`,
    'branch-1',
    '2026-11-27',
  )
  expect(result).toEqual({
    rows: [
      { postedOn: '2026-11-27', reference: 'ABC1', direction: 'credit', amountPaise: 190015 },
      { postedOn: '2026-11-27', reference: 'BANK-123', direction: 'debit', amountPaise: 1000 },
    ],
  })
})

test.each([
  'branch-2,2026-11-27,ABCD,credit,1',
  'branch-1,2026-11-28,ABCD,credit,1',
  'branch-1,2026-02-30,ABCD,credit,1',
  'branch-1,2026-11-27,ABCD,credit,1.99',
  'branch-1,2026-11-27,ABCD,debit,-1',
  'branch-1,2026-11-27,ABCD,credit,0',
  'branch-1,2026-11-27,ABCD,credit,10000000000',
  'branch-1,2026-11-27,=ABCD,debit,100',
  'branch-1,2026-11-27,ABCD,credit,100,extra',
  'branch-1,2026-11-27,"ABCD,debit,100',
])('rejects invalid statement row %s', (line) => {
  expect(parse(line)).toEqual({ error: 'invalid-row', line: 2 })
})

test('rejects duplicates after reference normalization', () => {
  expect(parse('branch-1,2026-11-27,ABCD,credit,100\nbranch-1,2026-11-27,abcd,credit,100')).toEqual(
    {
      error: 'duplicate-reference',
      line: 3,
    },
  )
})

test('enforces statement row and byte limits', () => {
  expect(
    parse(
      Array.from({ length: 101 }, (_, i) => `branch-1,2026-11-27,TXN${i},credit,100`).join('\n'),
    ),
  ).toEqual({ error: 'row-count' })
  expect(parse('é'.repeat(20000))).toEqual({ error: 'size' })
})
