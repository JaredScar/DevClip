import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-lock-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] p-6 text-center"
    >
      <div class="text-lg font-semibold text-white">DevClip is locked</div>
      <p class="max-w-sm text-sm text-zinc-500">Enter your PIN to continue.</p>
      <input
        type="password"
        class="w-full max-w-xs rounded-lg border border-white/15 bg-[#1a1a1a] px-3 py-2 text-center text-white"
        [(ngModel)]="pin"
        (keydown.enter)="submit()"
        autocomplete="off"
        autofocus
      />
      @if (error()) {
        <p class="text-sm text-red-400">{{ error() }}</p>
      }
      <button
        type="button"
        class="rounded-lg bg-devclip-accent px-6 py-2 text-sm font-semibold text-black"
        (click)="submit()"
      >
        Unlock
      </button>
    </div>
  `,
})
export class AppLockOverlayComponent {
  @Output() unlocked = new EventEmitter<void>();

  pin = '';
  readonly error = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    const res = (await window.devclip.lockUnlock(this.pin)) as { ok: boolean };
    if (res.ok) {
      this.unlocked.emit();
    } else {
      this.error.set('Incorrect PIN');
      this.pin = '';
    }
  }
}
