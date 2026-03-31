import { Injectable, signal } from '@angular/core';
import type { LicenseTier } from '../models/clip.model';

@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  readonly tier = signal<LicenseTier>('free');
  readonly hasLicenseKey = signal(false);

  async refresh(): Promise<void> {
    try {
      const s = await window.devclip.licenseGetStatus();
      const t = s.tier;
      this.tier.set(
        t === 'pro' || t === 'enterprise' ? (t as LicenseTier) : 'free'
      );
      this.hasLicenseKey.set(!!s.hasKey);
    } catch {
      this.tier.set('free');
      this.hasLicenseKey.set(false);
    }
  }

  isProUnlocked(): boolean {
    const t = this.tier();
    return t === 'pro' || t === 'enterprise';
  }

  isEnterpriseUnlocked(): boolean {
    return this.tier() === 'enterprise';
  }
}
