import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Declares which feature entitlement a route requires, e.g.
 * @RequiresFeature('timetable'). Consumed by FeatureGuard.
 *
 * When omitted, the route is open to any authenticated tenant user regardless
 * of feature entitlements (same fail-open-when-not-applicable pattern as
 * @Roles/RolesGuard).
 */
export const RequiresFeature = (featureKey: string) =>
  SetMetadata(REQUIRES_FEATURE_KEY, featureKey);
