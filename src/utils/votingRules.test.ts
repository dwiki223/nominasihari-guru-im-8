import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_OPTIONS,
  NOMINATIONS,
  TEACHERS,
  type VoteRecord,
} from '../data/electionData';
import {
  assignNomination,
  computeElectionSummary,
  getUsedNominationsMap,
  makeVoterKey,
  validateCompleteBallot,
  validateVoterIdentity,
} from './votingRules';

test('dataset contains exact 27 teachers, 29 nominations, and 14 classes', () => {
  assert.equal(TEACHERS.length, 27);
  assert.equal(NOMINATIONS.length, 29);
  assert.deepEqual(CLASS_OPTIONS, [
    '71', '72', '73', '74',
    '81', '82', '83', '84', '85',
    '91', '92', '93', '94', '95',
  ]);
  assert.equal(new Set(TEACHERS.map((t) => t.id)).size, 27);
  assert.equal(new Set(NOMINATIONS.map((c) => c.id)).size, 29);
});

test('validateVoterIdentity validates full name and exact class list', () => {
  assert.equal(validateVoterIdentity('Al', '81').valid, false);
  assert.equal(validateVoterIdentity('Alya Rahma', '').valid, false);
  assert.equal(validateVoterIdentity('Alya Rahma', '8A').valid, false);
  assert.equal(validateVoterIdentity('Alya Rahma', '75').valid, false);
  assert.equal(validateVoterIdentity('Alya Rahma', '81').valid, true);
  assert.equal(validateVoterIdentity('Alya Rahma', '95').valid, true);
  assert.equal(makeVoterKey('  Alya   Rahma ', ' 81 '), 'alya rahma::81');
});

test('assignNomination blocks selecting an already-chosen nomination for another teacher', () => {
  let ballot: Record<string, string> = {};

  const first = assignNomination(ballot, 't01', 'c06');
  assert.equal(first.ok, true);
  ballot = first.ballot;
  assert.equal(ballot.t01, 'c06');

  const duplicate = assignNomination(ballot, 't02', 'c06');
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error ?? '', /sudah dipilih/i);
  assert.equal(duplicate.ballot.t02, undefined);

  const second = assignNomination(ballot, 't02', 'c01');
  assert.equal(second.ok, true);
  ballot = second.ballot;

  const cleared = assignNomination(ballot, 't01', '');
  assert.equal(cleared.ok, true);
  assert.equal(cleared.ballot.t01, undefined);

  const reassigned = assignNomination(cleared.ballot, 't02', 'c06');
  assert.equal(reassigned.ok, true);
  assert.equal(reassigned.ballot.t02, 'c06');
});

test('getUsedNominationsMap tracks active assignments cleanly', () => {
  const map = getUsedNominationsMap({ t01: 'c06', t02: 'c01' });
  assert.deepEqual(map, { c06: 't01', c01: 't02' });
});

test('validateCompleteBallot requires all 27 teachers and rejects duplicates', () => {
  const incomplete: Record<string, string> = { t01: 'c01', t02: 'c02' };
  const incompleteRes = validateCompleteBallot(incomplete);
  assert.equal(incompleteRes.valid, false);
  assert.equal(incompleteRes.missingTeacherIds.length, 25);

  const duplicated: Record<string, string> = {};
  TEACHERS.forEach((t, idx) => {
    duplicated[t.id] = idx === 0 ? 'c01' : NOMINATIONS[idx].id;
  });
  duplicated[TEACHERS[1].id] = 'c01';
  const dupRes = validateCompleteBallot(duplicated);
  assert.equal(dupRes.valid, false);
  assert.deepEqual(dupRes.duplicateCategories, ['c01']);

  const complete: Record<string, string> = {};
  TEACHERS.forEach((t, idx) => {
    complete[t.id] = NOMINATIONS[idx].id;
  });
  const okRes = validateCompleteBallot(complete);
  assert.equal(okRes.valid, true);
  assert.equal(okRes.missingTeacherIds.length, 0);
  assert.equal(okRes.duplicateCategories.length, 0);
});

test('computeElectionSummary aggregates teacher top nominations and participating classes', () => {
  const selections1: Record<string, string> = {};
  const selections2: Record<string, string> = {};
  TEACHERS.forEach((t, idx) => {
    selections1[t.id] = NOMINATIONS[idx].id;
    selections2[t.id] = NOMINATIONS[idx].id;
  });

  const votes: VoteRecord[] = [
    {
      id: 'v1',
      fullName: 'Alya Rahma',
      className: '81',
      submittedAt: '2026-11-20T09:00:00.000Z',
      selections: selections1,
    },
    {
      id: 'v2',
      fullName: 'Budi Santoso',
      className: '92',
      submittedAt: '2026-11-20T09:05:00.000Z',
      selections: selections2,
    },
  ];

  const summary = computeElectionSummary(votes);
  assert.equal(summary.totalBallots, 2);
  assert.equal(summary.participatingClasses, 2);
  assert.equal(summary.totalClasses, 14);
  assert.equal(summary.teacherTallies[0].totalVotes, 2);
  assert.equal(summary.teacherTallies[0].topCategory?.category.id, 'c01');
  assert.equal(summary.teacherTallies[0].topCategory?.votes, 2);
});
