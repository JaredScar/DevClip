import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { FeatureFlagService } from '../services/feature-flag.service';

/**
 * Route guard that allows access only to Enterprise tier users.
 * Pro and Free tier users are redirected to the license settings page.
 *
 * Usage in routes:
 * ```typescript
 * { path: 'enterprise-audit', component: EnterpriseAuditComponent, canActivate: [enterpriseTierGuard] }
 * ```
 */
export const enterpriseTierGuard: CanActivateFn = (): boolean | UrlTree => {
  const flags = inject(FeatureFlagService);
  const router = inject(Router);

  if (flags.isEnterpriseUnlocked()) {
    return true;
  }

  // Redirect to license settings with a query param indicating upgrade needed
  const requiredTier = flags.isProUnlocked() ? 'enterprise' : 'pro';
  return router.createUrlTree(['/settings'], {
    queryParams: { upgrade: requiredTier, from: router.getCurrentNavigation()?.extractedUrl.toString() },
  });
};
