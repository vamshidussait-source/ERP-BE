import { CreateTenantSchemaInit1710000000001 } from './1710000000001-CreateTenantSchemaInit';
import { CreateUsersTable1710000000002 } from './1710000000002-CreateUsersTable';
import { CreateStudentsTable1710000000003 } from './1710000000003-CreateStudentsTable';
import { CreateClassesAndSectionsTables1710000000004 } from './1710000000004-CreateClassesAndSectionsTables';
import { RenameStudentClassIdToSectionId1710000000005 } from './1710000000005-RenameStudentClassIdToSectionId';
import { CreateStaffTable1710000000006 } from './1710000000006-CreateStaffTable';
import { CreateAttendanceTable1710000000007 } from './1710000000007-CreateAttendanceTable';
import { CreateFileUploadsTable1710000000008 } from './1710000000008-CreateFileUploadsTable';

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
];
