import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';

/**
 * Creates login accounts for demo data seeded by seed-demo-data.ts.
 *
 * Separate script because login/credential creation is a distinct concern
 * from bulk data volume.
 *
 * Creates:
 *   - Staff login accounts for all staff rows
 *   - Student login accounts for a representative subset (1-2 per section)
 *   - Parent login accounts for the same subset, linked via parent_student_links
 *
 * IDEMPOTENT — skips accounts that already exist (checked via linkedStaffId /
 * linkedStudentId / parent_student_links, not just email).
 *
 * Run with:  npm run seed:demo-logins
 *        or: npm run seed:demo-logins -- greenwood
 */

// ── Configuration ──────────────────────────────────────────────────────────

const TENANT_SCHEMA = process.argv[2] || 'greenwood';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);
const SAMPLE_CREDENTIALS_COUNT = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[seed-demo-logins:${TENANT_SCHEMA}] ${msg}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Starting demo login seed for tenant schema "${TENANT_SCHEMA}" …`);

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.query(`SET search_path TO "${TENANT_SCHEMA}", public`);

  try {
    // ── 1. Staff login accounts ────────────────────────────────────────────

    log('── Staff Login Accounts ─────────────────────────────────');
    const staffRows = (await qr.query(
      `SELECT id, email FROM staff WHERE status = 'active' ORDER BY email`,
    )) as Array<{ id: string; email: string }>;

    let staffInserted = 0;
    let staffSkipped = 0;
    const staffCredentials: Array<{ email: string; role: string }> = [];

    for (const staff of staffRows) {
      // Check if a staff-role user already exists linked to this staff record
      const existing = (await qr.query(
        `SELECT id FROM users WHERE "linkedStaffId" = $1 AND role = 'staff'`,
        [staff.id],
      )) as Array<{ id: string }>;

      if (existing[0]) {
        staffSkipped++;
        continue;
      }

      // Also check by email to avoid duplicate email constraint violations
      const existingEmail = (await qr.query(
        `SELECT id FROM users WHERE email = $1`,
        [staff.email],
      )) as Array<{ id: string }>;

      if (existingEmail[0]) {
        staffSkipped++;
        continue;
      }

      await qr.query(
        `INSERT INTO users (email, "passwordHash", role, "isActive", "linkedStaffId")
         VALUES ($1, $2, 'staff', true, $3)`,
        [staff.email, DEMO_PASSWORD_HASH, staff.id],
      );
      staffInserted++;
      staffCredentials.push({ email: staff.email, role: 'staff' });
    }

    log(`Staff: ${staffInserted} created, ${staffSkipped} already existed.`);

    // ── 2. Student login accounts (representative subset) ──────────────────

    log('── Student Login Accounts (subset) ──────────────────────');

    // Pick 1-2 active students per section for the demo subset.
    // We select students ordered by section to make the pick deterministic
    // and representative.
    const allActiveStudents = (await qr.query(
      `SELECT s.id, s."admissionNumber", s."sectionId", sec.name AS "sectionName",
              cls.name AS "className"
       FROM students s
       JOIN sections sec ON sec.id = s."sectionId"
       JOIN classes cls ON cls.id = sec."classId"
       WHERE s.status = 'active'
       ORDER BY cls."displayOrder", sec.name, s."lastName", s."firstName"`,
    )) as Array<{
      id: string;
      admissionNumber: string;
      sectionId: string;
      sectionName: string;
      className: string;
    }>;

    // Group by section, pick first 2 from each
    const bySection = new Map<string, typeof allActiveStudents>();
    for (const s of allActiveStudents) {
      const key = s.sectionId;
      if (!bySection.has(key)) bySection.set(key, []);
      const arr = bySection.get(key)!;
      if (arr.length < 2) arr.push(s);
    }
    const studentSubset = Array.from(bySection.values()).flat();

    log(
      `Selected ${studentSubset.length} students ` +
      `(1–2 per section from ${bySection.size} sections)`,
    );

    let studentInserted = 0;
    let studentSkipped = 0;
    const studentCredentials: Array<{ email: string; role: string }> = [];

    for (const student of studentSubset) {
      // Check if a student-role user already exists linked to this student
      const existing = (await qr.query(
        `SELECT id FROM users WHERE "linkedStudentId" = $1 AND role = 'student'`,
        [student.id],
      )) as Array<{ id: string }>;

      if (existing[0]) {
        studentSkipped++;
        continue;
      }

      const email = `student.${student.admissionNumber.toLowerCase()}@${TENANT_SCHEMA}.edu`;

      // Check email uniqueness
      const existingEmail = (await qr.query(
        `SELECT id FROM users WHERE email = $1`,
        [email],
      )) as Array<{ id: string }>;

      if (existingEmail[0]) {
        studentSkipped++;
        continue;
      }

      await qr.query(
        `INSERT INTO users (email, "passwordHash", role, "isActive", "linkedStudentId")
         VALUES ($1, $2, 'student', true, $3)`,
        [email, DEMO_PASSWORD_HASH, student.id],
      );
      studentInserted++;
      studentCredentials.push({ email, role: 'student' });
    }

    log(`Students: ${studentInserted} created, ${studentSkipped} already existed.`);

    // ── 3. Parent login accounts + parent_student_links ────────────────────

    log('── Parent Login Accounts ────────────────────────────────');
    let parentInserted = 0;
    let parentSkipped = 0;
    let linksInserted = 0;
    let linksSkipped = 0;
    const parentCredentials: Array<{ email: string; role: string }> = [];

    for (const student of studentSubset) {
      const parentEmail = `parent.${student.admissionNumber.toLowerCase()}@${TENANT_SCHEMA}.edu`;

      // Check if a parent already exists for this student
      const existingParent = (await qr.query(
        `SELECT u.id
         FROM users u
         JOIN parent_student_links psl ON psl."parentUserId" = u.id
         WHERE psl."studentId" = $1 AND u.role = 'parent'
         LIMIT 1`,
        [student.id],
      )) as Array<{ id: string }>;

      if (existingParent[0]) {
        parentSkipped++;
        // Still check/create the link in case it's missing
        const existingLink = (await qr.query(
          `SELECT id FROM parent_student_links
           WHERE "parentUserId" = $1 AND "studentId" = $2`,
          [existingParent[0].id, student.id],
        )) as Array<{ id: string }>;

        if (!existingLink[0]) {
          await qr.query(
            `INSERT INTO parent_student_links ("parentUserId", "studentId")
             VALUES ($1, $2)`,
            [existingParent[0].id, student.id],
          );
          linksInserted++;
        } else {
          linksSkipped++;
        }
        continue;
      }

      // Check email uniqueness
      const existingEmail = (await qr.query(
        `SELECT id FROM users WHERE email = $1`,
        [parentEmail],
      )) as Array<{ id: string }>;

      if (existingEmail[0]) {
        parentSkipped++;
        continue;
      }

      // Create parent user
      const rows = (await qr.query(
        `INSERT INTO users (email, "passwordHash", role, "isActive")
         VALUES ($1, $2, 'parent', true)
         RETURNING id`,
        [parentEmail, DEMO_PASSWORD_HASH],
      )) as Array<{ id: string }>;

      const parentId = rows[0].id;

      // Create parent_student_link
      await qr.query(
        `INSERT INTO parent_student_links ("parentUserId", "studentId")
         VALUES ($1, $2)
         ON CONFLICT ("parentUserId", "studentId") DO NOTHING`,
        [parentId, student.id],
      );

      parentInserted++;
      linksInserted++;
      parentCredentials.push({ email: parentEmail, role: 'parent' });
    }

    log(`Parents: ${parentInserted} created, ${parentSkipped} already existed.`);
    log(`Parent–student links: ${linksInserted} created, ${linksSkipped} already existed.`);

    // ── Summary ────────────────────────────────────────────────────────────

    log('');
    log('══════════════════════════════════════════════════════════');
    log('  DEMO LOGIN SEED COMPLETE');
    log('══════════════════════════════════════════════════════════');
    log(`  Schema:              ${TENANT_SCHEMA}`);
    log(`  Staff accounts:      ${staffInserted} created (${staffSkipped} existed)`);
    log(`  Student accounts:    ${studentInserted} created (${studentSkipped} existed)`);
    log(`  Parent accounts:     ${parentInserted} created (${parentSkipped} existed)`);
    log(`  Parent–student links: ${linksInserted} created (${linksSkipped} existed)`);
    log('══════════════════════════════════════════════════════════');
    log('');
    log(`  Fixed demo password: ${DEMO_PASSWORD}`);
    log('');

    // Print sample credentials
    const printSamples = (
      label: string,
      credentials: Array<{ email: string; role: string }>,
    ) => {
      const samples = credentials.slice(0, SAMPLE_CREDENTIALS_COUNT);
      if (samples.length === 0) return;
      log(`  ── ${label} (showing ${samples.length} of ${credentials.length}) ──`);
      for (const c of samples) {
        log(`    ${c.email}  /  ${DEMO_PASSWORD}`);
      }
      log('');
    };

    printSamples('Staff Credentials', staffCredentials);
    printSamples('Student Credentials', studentCredentials);
    printSamples('Parent Credentials', parentCredentials);

    log('══════════════════════════════════════════════════════════');
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`[seed-demo-logins:${TENANT_SCHEMA}] Failed:`, error);
  process.exit(1);
});
