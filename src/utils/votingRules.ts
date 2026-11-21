import {
  CLASS_OPTIONS,
  NOMINATIONS,
  NOMINATION_MAP,
  TEACHERS,
  TEACHER_MAP,
  VALID_CLASS_SET,
  type ElectionSummary,
  type VoteRecord,
} from '../data/electionData';

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function normalizeClassName(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function makeVoterKey(fullName: string, className: string): string {
  return `${normalizeName(fullName).toLowerCase()}::${normalizeClassName(className)}`;
}

export function validateVoterIdentity(
  fullName: string,
  className: string
): { valid: boolean; error?: string } {
  const cleanName = normalizeName(fullName);
  const cleanClass = normalizeClassName(className);

  if (cleanName.length < 3) {
    return {
      valid: false,
      error: 'Nama lengkap minimal 3 karakter.',
    };
  }
  if (cleanName.length > 80) {
    return {
      valid: false,
      error: 'Nama lengkap maksimal 80 karakter.',
    };
  }
  if (!VALID_CLASS_SET.has(cleanClass)) {
    return {
      valid: false,
      error: 'Pilih kelas yang valid (71–74, 81–85, atau 91–95).',
    };
  }

  return { valid: true };
}

/**
 * Returns a map of categoryId -> teacherId for all categories currently assigned in a ballot.
 */
export function getUsedNominationsMap(
  ballot: Record<string, string>
): Record<string, string> {
  const used: Record<string, string> = {};
  for (const [teacherId, categoryId] of Object.entries(ballot)) {
    if (categoryId && TEACHER_MAP.has(teacherId) && NOMINATION_MAP.has(categoryId)) {
      used[categoryId] = teacherId;
    }
  }
  return used;
}

/**
 * Enforces the rule: 1 nomination per teacher, and once a nomination is chosen for 1 teacher,
 * it cannot be chosen again for any other teacher.
 */
export function assignNomination(
  currentBallot: Record<string, string>,
  teacherId: string,
  categoryId: string
): { ballot: Record<string, string>; ok: boolean; error?: string } {
  const teacher = TEACHER_MAP.get(teacherId);
  if (!teacher) {
    return {
      ballot: currentBallot,
      ok: false,
      error: 'Data guru tidak ditemukan.',
    };
  }

  if (!categoryId) {
    const next = { ...currentBallot };
    delete next[teacherId];
    return { ballot: next, ok: true };
  }

  const category = NOMINATION_MAP.get(categoryId);
  if (!category) {
    return {
      ballot: currentBallot,
      ok: false,
      error: 'Kategori nominasi tidak valid.',
    };
  }

  for (const [otherTeacherId, assignedCategoryId] of Object.entries(currentBallot)) {
    if (otherTeacherId !== teacherId && assignedCategoryId === categoryId) {
      const otherTeacher = TEACHER_MAP.get(otherTeacherId);
      return {
        ballot: currentBallot,
        ok: false,
        error: `Nominasi "${category.label}" sudah dipilih untuk ${otherTeacher?.name ?? 'guru lain'} dan tidak dapat dipilih lagi di guru berikutnya.`,
      };
    }
  }

  return {
    ballot: {
      ...currentBallot,
      [teacherId]: categoryId,
    },
    ok: true,
  };
}

/**
 * Validates that every teacher has exactly 1 nomination and no nomination is duplicated across teachers.
 */
export function validateCompleteBallot(ballot: Record<string, string>): {
  valid: boolean;
  missingTeacherIds: string[];
  duplicateCategories: string[];
  error?: string;
} {
  const missingTeacherIds: string[] = [];
  const seenCategories = new Set<string>();
  const duplicateCategories: string[] = [];

  for (const teacher of TEACHERS) {
    const chosenCategory = ballot[teacher.id];
    if (!chosenCategory || !NOMINATION_MAP.has(chosenCategory)) {
      missingTeacherIds.push(teacher.id);
      continue;
    }
    if (seenCategories.has(chosenCategory)) {
      duplicateCategories.push(chosenCategory);
    } else {
      seenCategories.add(chosenCategory);
    }
  }

  if (duplicateCategories.length > 0) {
    const firstDup = NOMINATION_MAP.get(duplicateCategories[0])?.label ?? duplicateCategories[0];
    return {
      valid: false,
      missingTeacherIds,
      duplicateCategories,
      error: `Nominasi "${firstDup}" terdeteksi dipilih lebih dari satu guru. Setiap nominasi hanya boleh untuk 1 guru.`,
    };
  }

  if (missingTeacherIds.length > 0) {
    return {
      valid: false,
      missingTeacherIds,
      duplicateCategories,
      error: `Masih ada ${missingTeacherIds.length} guru yang belum dipilih nominasinya.`,
    };
  }

  return {
    valid: true,
    missingTeacherIds: [],
    duplicateCategories: [],
  };
}

export function computeElectionSummary(votes: VoteRecord[]): ElectionSummary {
  const teacherCategoryCounts = new Map<string, Map<string, number>>();
  const categoryTeacherCounts = new Map<string, Map<string, number>>();
  const classCounts = new Map<string, number>();

  for (const t of TEACHERS) {
    const catMap = new Map<string, number>();
    for (const c of NOMINATIONS) {
      catMap.set(c.id, 0);
    }
    teacherCategoryCounts.set(t.id, catMap);
  }

  for (const c of NOMINATIONS) {
    const tMap = new Map<string, number>();
    for (const t of TEACHERS) {
      tMap.set(t.id, 0);
    }
    categoryTeacherCounts.set(c.id, tMap);
  }

  for (const vote of votes) {
    const cls = normalizeClassName(vote.className) || 'LAINNYA';
    classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);

    for (const [teacherId, categoryId] of Object.entries(vote.selections)) {
      const tMap = teacherCategoryCounts.get(teacherId);
      if (tMap && tMap.has(categoryId)) {
        tMap.set(categoryId, (tMap.get(categoryId) ?? 0) + 1);
      }
      const cMap = categoryTeacherCounts.get(categoryId);
      if (cMap && cMap.has(teacherId)) {
        cMap.set(teacherId, (cMap.get(teacherId) ?? 0) + 1);
      }
    }
  }

  const teacherTallies = TEACHERS.map((teacher) => {
    const catMap = teacherCategoryCounts.get(teacher.id)!;
    const breakdown = NOMINATIONS.map((category) => ({
      category,
      votes: catMap.get(category.id) ?? 0,
    }))
      .filter((item) => item.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.category.label.localeCompare(b.category.label));

    const totalVotes = breakdown.reduce((sum, item) => sum + item.votes, 0);
    const topCategory = breakdown.length > 0 ? breakdown[0] : null;

    return {
      teacher,
      totalVotes,
      topCategory,
      breakdown,
    };
  });

  const categorySummaries = NOMINATIONS.map((category) => {
    const tMap = categoryTeacherCounts.get(category.id)!;
    let totalVotes = 0;
    let leadingTeacher: { teacher: (typeof TEACHERS)[number]; votes: number } | null = null;

    for (const teacher of TEACHERS) {
      const count = tMap.get(teacher.id) ?? 0;
      totalVotes += count;
      if (count > 0 && (!leadingTeacher || count > leadingTeacher.votes)) {
        leadingTeacher = { teacher, votes: count };
      }
    }

    return {
      category,
      totalVotes,
      leadingTeacher,
    };
  });

  const classDistribution = Array.from(classCounts.entries())
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => a.className.localeCompare(b.className));

  return {
    totalBallots: votes.length,
    participatingClasses: classDistribution.length,
    totalClasses: CLASS_OPTIONS.length,
    classDistribution,
    teacherTallies,
    categorySummaries,
  };
}
