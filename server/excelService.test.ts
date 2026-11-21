import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { NOMINATIONS, TEACHERS, type VoteRecord } from '../src/data/electionData.ts';
import { buildElectionWorkbookBuffer } from './excelService.ts';

test('buildElectionWorkbookBuffer generates valid 3-sheet xlsx without tokens', async () => {
  const selections: Record<string, string> = {};
  TEACHERS.forEach((t, idx) => {
    selections[t.id] = NOMINATIONS[idx].id;
  });

  const votes: VoteRecord[] = [
    {
      id: 'v-1',
      fullName: 'Alya Rahma',
      className: '81',
      submittedAt: '2026-11-20T09:00:00.000Z',
      selections,
    },
  ];

  const buffer = await buildElectionWorkbookBuffer(votes);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.equal(wb.worksheets.length, 3);
  assert.equal(wb.worksheets[0].name, 'Ringkasan Nominasi Guru');
  assert.equal(wb.worksheets[1].name, 'Matriks Suara');
  assert.equal(wb.worksheets[2].name, 'Detail Suara Pemilih');
});
