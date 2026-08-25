import { CreateTenantSchemaInit1710000000001 } from './1710000000001-CreateTenantSchemaInit';
import { CreateUsersTable1710000000002 } from './1710000000002-CreateUsersTable';
import { CreateStudentsTable1710000000003 } from './1710000000003-CreateStudentsTable';
import { CreateClassesAndSectionsTables1710000000004 } from './1710000000004-CreateClassesAndSectionsTables';
import { RenameStudentClassIdToSectionId1710000000005 } from './1710000000005-RenameStudentClassIdToSectionId';
import { CreateStaffTable1710000000006 } from './1710000000006-CreateStaffTable';
import { CreateAttendanceTable1710000000007 } from './1710000000007-CreateAttendanceTable';
import { CreateFileUploadsTable1710000000008 } from './1710000000008-CreateFileUploadsTable';
import { CreateParentStudentLinksTable1710000000009 } from './1710000000009-CreateParentStudentLinksTable';
import { AddLinkedStudentIdToUsers1710000000010 } from './1710000000010-AddLinkedStudentIdToUsers';
import { AddLinkedStaffIdToUsers1710000000011 } from './1710000000011-AddLinkedStaffIdToUsers';
import { CreateTimetableTable1710000000012 } from './1710000000012-CreateTimetableTable';
import { CreateAssessmentPeriodsTable1710000000013 } from './1710000000013-CreateAssessmentPeriodsTable';
import { CreateProgressReportsTable1710000000014 } from './1710000000014-CreateProgressReportsTable';
import { CreateCoScholasticGradesTable1710000000015 } from './1710000000015-CreateCoScholasticGradesTable';
import { CreateSubjectsTable1710000000016 } from './1710000000016-CreateSubjectsTable';
import { CreateGradingScalesTable1710000000017 } from './1710000000017-CreateGradingScalesTable';
import { CreateGradeBandsTable1710000000018 } from './1710000000018-CreateGradeBandsTable';
import { CreateExamsTable1710000000019 } from './1710000000019-CreateExamsTable';
import { CreateExamSubjectConfigsTable1710000000020 } from './1710000000020-CreateExamSubjectConfigsTable';
import { CreateExamMarksTable1710000000021 } from './1710000000021-CreateExamMarksTable';

/**
 * Add new tenant-schema migrations here, in order, as they're created.
 * This static registry replaces filesystem scanning to avoid Windows path
 * and ESM/CommonJS runtime import issues.
 */
export const tenantSchemaMigrations = [
  CreateTenantSchemaInit1710000000001,
  CreateUsersTable1710000000002,
  CreateStudentsTable1710000000003,
  CreateClassesAndSectionsTables1710000000004,
  RenameStudentClassIdToSectionId1710000000005,
  CreateStaffTable1710000000006,
  CreateAttendanceTable1710000000007,
  CreateFileUploadsTable1710000000008,
  CreateParentStudentLinksTable1710000000009,
  AddLinkedStudentIdToUsers1710000000010,
  AddLinkedStaffIdToUsers1710000000011,
  CreateTimetableTable1710000000012,
  CreateAssessmentPeriodsTable1710000000013,
  CreateProgressReportsTable1710000000014,
  CreateCoScholasticGradesTable1710000000015,
  CreateSubjectsTable1710000000016,
  CreateGradingScalesTable1710000000017,
  CreateGradeBandsTable1710000000018,
  CreateExamsTable1710000000019,
  CreateExamSubjectConfigsTable1710000000020,
  CreateExamMarksTable1710000000021,
];
