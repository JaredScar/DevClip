/**
 * Angular route guards for tier-based feature protection.
 *
 * These guards ensure that only users with the appropriate license tier
 * can access certain routes. Users without the required tier are redirected
to the settings page with upgrade prompts.
 */

export { proTierGuard } from './pro-tier.guard';
export { enterpriseTierGuard } from './enterprise-tier.guard';
