import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ClipService } from './clip.service';

@Injectable({ providedIn: 'root' })
export class ClipboardService implements OnDestroy {
  private readonly query$ = new Subject<string>();
  private sub: Subscription;

  constructor(private readonly clips: ClipService) {
    this.sub = this.query$
      .pipe(debounceTime(100), distinctUntilChanged())
      .subscribe((q) => {
        this.clips.refreshSearch(q);
      });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.query$.complete();
  }

  notifySearchInput(raw: string) {
    this.query$.next(raw);
  }
}
