import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppLockOverlayComponent } from './components/app-lock-overlay/app-lock-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, AppLockOverlayComponent],
  template: `
    @if (showLock()) {
      <app-lock-overlay (unlocked)="onUnlock()" />
    } @else {
      <router-outlet />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  readonly showLock = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const st = (await window.devclip.lockGetState()) as {
        enabled: boolean;
        unlocked: boolean;
      };
      this.showLock.set(!!st.enabled && !st.unlocked);
    } catch {
      this.showLock.set(false);
    }
  }

  onUnlock(): void {
    this.showLock.set(false);
  }
}
