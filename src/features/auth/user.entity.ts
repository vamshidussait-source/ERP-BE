import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  SchoolAdmin = 'school_admin',
  Staff = 'staff',
  Parent = 'parent',
  Student = 'student',
}

/**
 * Tenant-scoped User entity.
 * Lives inside each tenant's own schema (not public).
 * Queried via TenantConnectionService's queryRunner with search_path set.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: UserRole.Staff })
  role: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * True while the user is still on a temporary password (freshly issued
   * login or admin reset). Forces the password-change screen on login and
   * drives the 'password_reset_pending' loginStatus in the account-access
   * list. Cleared by POST /auth/change-password.
   */
  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  @Column({ type: 'uuid', nullable: true })
  linkedStudentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  linkedStaffId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
