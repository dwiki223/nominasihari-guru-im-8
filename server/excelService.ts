import ExcelJS from 'exceljs';
import {
  NOMINATIONS,
  NOMINATION_MAP,
  TEACHERS,
  type VoteRecord,
} from '../src/data/electionData.ts';
import { computeElectionSummary } from '../src/utils/votingRules.ts';

function styleHeaderRow(row: ExcelJS.Row, fillArgb: string) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: fillArgb },
  };
  row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row.height = 26;
}

export async function buildElectionWorkbookBuffer(
  votes: VoteRecord[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aplikasi Voting Nominasi Guru';
  workbook.created = new Date();

  const summary = computeElectionSummary(votes);

  // Sheet 1: Ringkasan & Pemenang per Guru
  const summarySheet = workbook.addWorksheet('Ringkasan Nominasi Guru', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  summarySheet.columns = [
    { header: 'No', key: 'order', width: 6 },
    { header: 'Nama Guru', key: 'teacherName', width: 38 },
    { header: 'Nominasi Terbanyak', key: 'topNomination', width: 24 },
    { header: 'Jumlah Suara Terbanyak', key: 'topVotes', width: 22 },
    { header: 'Total Suara Masuk', key: 'totalVotes', width: 18 },
    { header: 'Rincian Perolehan Suara', key: 'breakdown', width: 58 },
  ];
  styleHeaderRow(summarySheet.getRow(1), 'FF1E3A8A');

  for (const tally of summary.teacherTallies) {
    const breakdownText =
      tally.breakdown.length > 0
        ? tally.breakdown.map((b) => `${b.category.label} (${b.votes})`).join(', ')
        : 'Belum ada suara';

    summarySheet.addRow({
      order: tally.teacher.order,
      teacherName: tally.teacher.name,
      topNomination: tally.topCategory ? tally.topCategory.category.label : '-',
      topVotes: tally.topCategory ? tally.topCategory.votes : 0,
      totalVotes: tally.totalVotes,
      breakdown: breakdownText,
    });
  }

  // Sheet 2: Matriks Guru x 29 Kategori
  const matrixSheet = workbook.addWorksheet('Matriks Suara', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  matrixSheet.columns = [
    { header: 'No', key: 'order', width: 6 },
    { header: 'Nama Guru', key: 'teacherName', width: 36 },
    ...NOMINATIONS.map((cat) => ({
      header: cat.label,
      key: cat.id,
      width: 15,
    })),
    { header: 'Total', key: 'total', width: 10 },
  ];
  styleHeaderRow(matrixSheet.getRow(1), 'FF0F172A');

  for (const tally of summary.teacherTallies) {
    const countByCat = new Map(tally.breakdown.map((b) => [b.category.id, b.votes]));
    const rowData: Record<string, string | number> = {
      order: tally.teacher.order,
      teacherName: tally.teacher.name,
      total: tally.totalVotes,
    };
    for (const cat of NOMINATIONS) {
      rowData[cat.id] = countByCat.get(cat.id) ?? 0;
    }
    matrixSheet.addRow(rowData);
  }

  // Sheet 3: Detail Suara Pemilih
  const votesSheet = workbook.addWorksheet('Detail Suara Pemilih', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });

  votesSheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Waktu Voting', key: 'submittedAt', width: 24 },
    { header: 'Nama Lengkap Siswa', key: 'fullName', width: 28 },
    { header: 'Kelas', key: 'className', width: 10 },
    ...TEACHERS.map((t) => ({
      header: t.name,
      key: t.id,
      width: 24,
    })),
  ];
  styleHeaderRow(votesSheet.getRow(1), 'FF1E3A8A');

  votes.forEach((vote, idx) => {
    const rowData: Record<string, string | number> = {
      no: idx + 1,
      submittedAt: vote.submittedAt,
      fullName: vote.fullName,
      className: vote.className,
    };
    for (const t of TEACHERS) {
      const catId = vote.selections[t.id];
      rowData[t.id] = catId ? NOMINATION_MAP.get(catId)?.label ?? catId : '-';
    }
    votesSheet.addRow(rowData);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
