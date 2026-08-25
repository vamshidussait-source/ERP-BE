import { faker } from '@faker-js/faker';
import { AppDataSource } from '../data-source';

/**
 * Seeds realistic demo data into a tenant schema for volume/realism.
 *
 * Creates:
 *   - 6 classes (Kindergarten + Grade 6–10) with 2–3 sections each
 *   - 80–120 students distributed across sections
 *   - 15–20 staff members with varied designations
 *   - Attendance records for the last 30 school days (skipping weekends)
 *
 * IDEMPOTENT — safe to run multiple times: existing records are detected by
 * unique fields (admissionNumber, employeeId, studentId+date) and skipped.
 *
 * Run with:  npm run seed:demo
 *        or: npm run seed:demo -- greenwood
 *
 * The optional positional argument is the tenant schema name (defaults to
 * "greenwood").
 */

// ── Configuration ──────────────────────────────────────────────────────────

const TENANT_SCHEMA = process.argv[2] || 'greenwood';

const CLASS_DEFINITIONS = [
  { name: 'Kindergarten', displayOrder: 0, sections: ['A', 'B'] },
  { name: 'Grade 6', displayOrder: 6, sections: ['A', 'B', 'C'] },
  { name: 'Grade 7', displayOrder: 7, sections: ['A', 'B', 'C'] },
  { name: 'Grade 8', displayOrder: 8, sections: ['A', 'B', 'C'] },
  { name: 'Grade 9', displayOrder: 9, sections: ['A', 'B'] },
  { name: 'Grade 10', displayOrder: 10, sections: ['A', 'B', 'C'] },
];

const STAFF_COUNT = faker.number.int({ min: 15, max: 20 });
const STUDENT_COUNT = faker.number.int({ min: 80, max: 120 });

const DESIGNATIONS = [
  'Math Teacher',
  'Science Teacher',
  'English Teacher',
  'History Teacher',
  'Physical Education Teacher',
  'Art Teacher',
  'Music Teacher',
  'Computer Science Teacher',
  'Librarian',
  'School Counselor',
  'Vice Principal',
  'Class Teacher',
  'Hindi Teacher',
  'Geography Teacher',
  'Biology Teacher',
];

const ATTENDANCE_DISTRIBUTION = [
  { status: 'present', weight: 90 },
  { status: 'absent', weight: 5 },
  { status: 'late', weight: 3 },
  { status: 'excused', weight: 2 },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[seed-demo:${TENANT_SCHEMA}] ${msg}`);
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Weighted random pick from the attendance distribution.
 */
function randomAttendanceStatus(): string {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const { status, weight } of ATTENDANCE_DISTRIBUTION) {
    cumulative += weight;
    if (roll < cumulative) return status;
  }
  return 'present';
}

/**
 * Returns an array of Date objects for the last N school days (skipping
 * weekends), ordered oldest → newest.
 */
function lastSchoolDays(n: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  while (days.length < n) {
    cursor.setDate(cursor.getDate() - 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      days.unshift(new Date(cursor));
    }
  }
  return days;
}

/** Format a Date as YYYY-MM-DD. */
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute an approximate date-of-birth for a student in the given grade.
 * We assume grades 6–10 map to ages ~11–15; Kindergarten ~5–6.
 */
function randomDob(displayOrder: number): string {
  let baseAge: number;
  if (displayOrder === 0) {
    baseAge = faker.number.int({ min: 4, max: 6 });
  } else {
    baseAge = displayOrder + 5; // Grade 6 → age 11
  }
  const birthYear = new Date().getFullYear() - baseAge;
  const month = faker.number.int({ min: 1, max: 12 });
  const day = faker.number.int({ min: 1, max: 28 });
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

interface SectionRow {
  id: string;
  name: string;
  classId: string;
}
interface StaffRow {
  id: string;
}

async function main(): Promise<void> {
  log(`Starting demo seed for tenant schema "${TENANT_SCHEMA}" …`);

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.query(`SET search_path TO "${TENANT_SCHEMA}", public`);

  try {
    // ── 1. Classes & Sections ──────────────────────────────────────────────

    log('── Classes & Sections ──────────────────────────────────');
    const allSections: Array<{ classId: string; sectionId: string; sectionName: string; className: string }> = [];
    let classesInserted = 0;
    let classesSkipped = 0;
    let sectionsInserted = 0;
    let sectionsSkipped = 0;

    for (const cls of CLASS_DEFINITIONS) {
      // Upsert class by name
      const existingClass = (await qr.query(
        `SELECT id FROM classes WHERE name = $1`,
        [cls.name],
      )) as Array<{ id: string }>;

      let classId: string;
      if (existingClass[0]) {
        classId = existingClass[0].id;
        classesSkipped++;
      } else {
        const rows = (await qr.query(
          `INSERT INTO classes (name, "displayOrder")
           VALUES ($1, $2)
           RETURNING id`,
          [cls.name, cls.displayOrder],
        )) as Array<{ id: string }>;
        classId = rows[0].id;
        classesInserted++;
      }

      for (const sectionName of cls.sections) {
        const existingSection = (await qr.query(
          `SELECT id FROM sections WHERE "classId" = $1 AND name = $2`,
          [classId, sectionName],
        )) as Array<{ id: string }>;

        let sectionId: string;
        if (existingSection[0]) {
          sectionId = existingSection[0].id;
          sectionsSkipped++;
        } else {
          const capacity = faker.number.int({ min: 25, max: 35 });
          const rows = (await qr.query(
            `INSERT INTO sections ("classId", name, capacity)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [classId, sectionName, capacity],
          )) as Array<{ id: string }>;
          sectionId = rows[0].id;
          sectionsInserted++;
        }

        allSections.push({ classId, sectionId, sectionName, className: cls.name });
      }
    }

    log(
      `Classes: ${classesInserted} created, ${classesSkipped} already existed. ` +
      `Sections: ${sectionsInserted} created, ${sectionsSkipped} already existed.`,
    );

    // ── 2. Staff ───────────────────────────────────────────────────────────

    log('── Staff ───────────────────────────────────────────────');
    let staffInserted = 0;
    let staffSkipped = 0;
    const staffIds: string[] = [];

    for (let i = 0; i < STAFF_COUNT; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i + 1}@${TENANT_SCHEMA}.edu`;
      const employeeId = `EMP-${String(i + 1).padStart(4, '0')}`;
      const designation = pick(DESIGNATIONS);
      const phone = faker.phone.number({ style: 'national' });

      const existing = (await qr.query(
        `SELECT id FROM staff WHERE "employeeId" = $1`,
        [employeeId],
      )) as Array<{ id: string }>;

      if (existing[0]) {
        staffIds.push(existing[0].id);
        staffSkipped++;
        continue;
      }

      const rows = (await qr.query(
        `INSERT INTO staff ("firstName", "lastName", email, phone, designation, "employeeId", status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id`,
        [firstName, lastName, email, phone, designation, employeeId],
      )) as Array<{ id: string }>;
      staffIds.push(rows[0].id);
      staffInserted++;
    }

    log(`Staff: ${staffInserted} created, ${staffSkipped} already existed (total ${staffIds.length}).`);

    // ── 3. Students ────────────────────────────────────────────────────────

    log('── Students ────────────────────────────────────────────');
    let studentsInserted = 0;
    let studentsSkipped = 0;
    const studentRows: Array<{ id: string; sectionId: string | null }> = [];

    for (let i = 0; i < STUDENT_COUNT; i++) {
      const section = pick(allSections);
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const admissionNumber = `ADM-2024-${String(i + 1).padStart(3, '0')}`;
      const dateOfBirth = randomDob(
        CLASS_DEFINITIONS.find((c) => c.name === section.className)?.displayOrder ?? 6,
      );

      // ~92% active, 5% inactive, 3% graduated
      const statusRoll = Math.random();
      const status = statusRoll < 0.92 ? 'active' : statusRoll < 0.97 ? 'inactive' : 'graduated';

      const existing = (await qr.query(
        `SELECT id FROM students WHERE "admissionNumber" = $1`,
        [admissionNumber],
      )) as Array<{ id: string }>;

      if (existing[0]) {
        studentsSkipped++;
        continue;
      }

      const rows = (await qr.query(
        `INSERT INTO students ("firstName", "lastName", "dateOfBirth", "admissionNumber", "sectionId", status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [firstName, lastName, dateOfBirth, admissionNumber, section.sectionId, status],
      )) as Array<{ id: string }>;

      studentRows.push({ id: rows[0].id, sectionId: section.sectionId });
      studentsInserted++;
    }

    log(`Students: ${studentsInserted} created, ${studentsSkipped} already existed.`);

    // ── 4. Attendance ──────────────────────────────────────────────────────

    log('── Attendance (last 30 school days) ────────────────────');
    const schoolDays = lastSchoolDays(30);
    log(`School days to cover: ${schoolDays.length} (${fmt(schoolDays[0])} → ${fmt(schoolDays[schoolDays.length - 1])})`);

    // Fetch ALL active students from the DB (not just newly-created ones)
    // so attendance seeding always operates on the full current student roster.
    const activeStudents = (await qr.query(
      `SELECT id, "sectionId" FROM students WHERE status = 'active'`,
    )) as Array<{ id: string; sectionId: string | null }>;

    let attendanceInserted = 0;
    let attendanceSkipped = 0;

    // Process in batches to avoid huge single transactions
    const BATCH_SIZE = 200;
    const totalExpected = activeStudents.length * schoolDays.length;
    log(`Expected attendance records: ~${totalExpected} (processing in batches of ${BATCH_SIZE}) …`);

    let processed = 0;
    for (const day of schoolDays) {
      const dateStr = fmt(day);

      for (const student of activeStudents) {
        processed++;

        // Check if record already exists
        const existing = (await qr.query(
          `SELECT id FROM attendance WHERE "studentId" = $1 AND date = $2`,
          [student.id, dateStr],
        )) as Array<{ id: string }>;

        if (existing[0]) {
          attendanceSkipped++;
          continue;
        }

        const status = randomAttendanceStatus();
        const markedBy = pick(staffIds);
        const notes =
          status === 'absent'
            ? pick([
                'Sick leave',
                'Family emergency',
                'Medical appointment',
                null,
                null,
              ])
            : status === 'excused'
              ? pick(['Medical appointment', 'School event', 'Family function'])
              : null;

        await qr.query(
          `INSERT INTO attendance ("studentId", "sectionId", date, status, "markedBy", notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [student.id, student.sectionId, dateStr, status, markedBy, notes],
        );
        attendanceInserted++;
      }

      // Progress log every few days
      if (processed % (activeStudents.length * 3) === 0 || day === schoolDays[schoolDays.length - 1]) {
        log(
          `  Progress: ${processed}/${totalExpected} records checked ` +
          `(${attendanceInserted} inserted, ${attendanceSkipped} skipped so far)`,
        );
      }
    }

    log(`Attendance: ${attendanceInserted} created, ${attendanceSkipped} already existed.`);

    // ── Summary ────────────────────────────────────────────────────────────

    log('');
    log('══════════════════════════════════════════════════════════');
    log('  DEMO SEED COMPLETE');
    log('══════════════════════════════════════════════════════════');
    log(`  Schema:          ${TENANT_SCHEMA}`);
    log(`  Classes:         ${classesInserted} created (${classesSkipped} existed)`);
    log(`  Sections:        ${sectionsInserted} created (${sectionsSkipped} existed)`);
    log(`  Staff:           ${staffInserted} created (${staffSkipped} existed)`);
    log(`  Students:        ${studentsInserted} created (${studentsSkipped} existed)`);
    log(`  Attendance:      ${attendanceInserted} created (${attendanceSkipped} existed)`);
    log('══════════════════════════════════════════════════════════');
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`[seed-demo:${TENANT_SCHEMA}] Failed:`, error);
  process.exit(1);
});
