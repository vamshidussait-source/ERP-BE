import { AppDataSource } from '../data-source';
import { TenantPlanTier } from '../features/tenants/tenant.entity';
import { Feature } from '../features/features/feature.entity';
import { PlanTierFeature } from '../features/features/plan-tier-feature.entity';

/**
 * Seeds the feature entitlement catalog into the public schema:
 *   - public.features:           all platform features (key -> name/description)
 *   - public.plan_tier_features: per-tier default enabled state
 *
 * IDEMPOTENT — safe to run multiple times: existing rows are updated in place
 * when their values drift from the seed data below, never re-inserted.
 *
 * Run with: npm run seed:features
 */
const FEATURES: Array<{
  key: string;
  name: string;
  description: string;
}> = [
  {
    key: 'students',
    name: 'Student Management',
    description: 'Student profiles, admission numbers, and status tracking.',
  },
  {
    key: 'staff',
    name: 'Staff Management',
    description: 'Staff profiles, roles, and employee records.',
  },
  {
    key: 'classes_sections',
    name: 'Classes & Sections',
    description: 'Classes, sections, and class-to-section assignments.',
  },
  {
    key: 'attendance',
    name: 'Attendance Tracking',
    description: 'Daily attendance marking, leave requests, and reports.',
  },
  {
    key: 'notifications',
    name: 'SMS/Email/Push Notifications',
    description: 'Outbound notifications to parents and staff via SMS, email, and push.',
  },
  {
    key: 'file_uploads',
    name: 'Document/File Uploads',
    description: 'Document and file uploads attached to students and staff.',
  },
  {
    key: 'progress_reports',
    name: 'Progress Reports',
    description: 'Periodic progress and report card generation.',
  },
  {
    key: 'fee_management',
    name: 'Fee Management',
    description: 'Fee structures, invoices, and payment tracking.',
  },
  {
    key: 'timetable',
    name: 'Timetable/Scheduling',
    description: 'Class timetables and scheduling.',
  },
  {
    key: 'exams_grades',
    name: 'Exams & Grades',
    description: 'Exam management and grade recording.',
  },
];

const PLAN_TIER_DEFAULTS: Record<TenantPlanTier, Record<string, boolean>> = {
  [TenantPlanTier.Trial]: {
    students: true,
    staff: true,
    classes_sections: true,
    attendance: true,
    notifications: false,
    file_uploads: false,
    progress_reports: false,
    fee_management: false,
    timetable: false,
    exams_grades: false,
  },
  [TenantPlanTier.Basic]: {
    students: true,
    staff: true,
    classes_sections: true,
    attendance: true,
    notifications: true,
    file_uploads: true,
    progress_reports: false,
    fee_management: false,
    timetable: false,
    exams_grades: false,
  },
  [TenantPlanTier.Premium]: {
    students: true,
    staff: true,
    classes_sections: true,
    attendance: true,
    notifications: true,
    file_uploads: true,
    progress_reports: true,
    fee_management: true,
    timetable: true,
    exams_grades: true,
  },
};

async function seedFeatures(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const featureRepository = AppDataSource.getRepository(Feature);
    const planTierFeatureRepository = AppDataSource.getRepository(PlanTierFeature);

    // 1. Features catalog.
    let featuresInserted = 0;
    let featuresUpdated = 0;
    for (const feature of FEATURES) {
      const existing = await featureRepository.findOne({
        where: { key: feature.key },
      });

      if (existing) {
        if (
          existing.name !== feature.name ||
          existing.description !== feature.description
        ) {
          existing.name = feature.name;
          existing.description = feature.description;
          await featureRepository.save(existing);
          featuresUpdated++;
        }
      } else {
        await featureRepository.save(featureRepository.create(feature));
        featuresInserted++;
      }
    }

    console.log(
      `[seed-features] Features: ${featuresInserted} inserted, ` +
        `${featuresUpdated} updated, ` +
        `${FEATURES.length - featuresInserted - featuresUpdated} unchanged.`,
    );

    // 2. Plan tier defaults.
    let tiersInserted = 0;
    let tiersUpdated = 0;
    for (const [planTier, defaults] of Object.entries(PLAN_TIER_DEFAULTS)) {
      for (const [featureKey, enabled] of Object.entries(defaults)) {
        const existing = await planTierFeatureRepository.findOne({
          where: { planTier: planTier as TenantPlanTier, featureKey },
        });

        if (existing) {
          if (existing.enabled !== enabled) {
            existing.enabled = enabled;
            await planTierFeatureRepository.save(existing);
            tiersUpdated++;
          }
        } else {
          await planTierFeatureRepository.save(
            planTierFeatureRepository.create({
              planTier: planTier as TenantPlanTier,
              featureKey,
              enabled,
            }),
          );
          tiersInserted++;
        }
      }
    }

    const totalTierRows = Object.values(PLAN_TIER_DEFAULTS).reduce(
      (sum, defaults) => sum + Object.keys(defaults).length,
      0,
    );
    console.log(
      `[seed-features] Plan tier defaults: ${tiersInserted} inserted, ` +
        `${tiersUpdated} updated, ` +
        `${totalTierRows - tiersInserted - tiersUpdated} unchanged.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

seedFeatures().catch((error) => {
  console.error('[seed-features] Failed:', error);
  process.exit(1);
});
