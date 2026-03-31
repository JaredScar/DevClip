import { Routes } from '@angular/router';
import { MainComponent } from './components/main/main.component';
import { OverlayComponent } from './components/overlay/overlay.component';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', component: MainComponent },
  { path: 'overlay', component: OverlayComponent },
];
