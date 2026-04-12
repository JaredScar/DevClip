import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { FeatureFlagService } from '../services/feature-flag.service';

/**
 * Route guard that allows access only to Pro and Enterprise tier users.
 * Free tier users are redirected to the license settings page.
 *
 * Usage in routes:
 * ```typescript
 * { path: 'ai-actions', component: AiActionsComponent, canActivate: [proTierGuard] }
 * ```
 */
export const proTierGuard: CanActivateFn = (): boolean | UrlTree => {
  const flags = inject(FeatureFlagService);
  const router = inject(Router);

  if (flags.isProUnlocked()) {
    return true;
  }

  // Redirect to license settings with a query param indicating upgrade needed
  return router.createUrlTree(['/settings'], {
    queryParams: { upgrade: 'pro', from: router.getCurrentNavigation()?.extractedUrl.toString() },
  });
};
