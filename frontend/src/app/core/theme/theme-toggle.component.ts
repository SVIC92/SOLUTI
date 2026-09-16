import { Component, inject } from '@angular/core';
import { AppTheme, ThemeService } from './theme.service';

interface ThemeOption {
  value: AppTheme;
  label: string;
  icon: string;
}

const OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Claro', icon: 'light_mode' },
  { value: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  { value: 'neon', label: 'Black Neon', icon: 'bolt' },
];

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <div class="flex items-center gap-0.5 p-0.5 bg-surface-container-low rounded-xl" role="radiogroup" aria-label="Tema de la interfaz">
      @for (option of options; track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="theme.theme() === option.value"
          [title]="option.label"
          (click)="theme.setTheme(option.value)"
          class="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-card transition-colors"
          [class.bg-surface-card]="theme.theme() === option.value"
          [class.text-primary]="theme.theme() === option.value"
          [class.shadow-sm]="theme.theme() === option.value"
        >
          <span class="material-symbols-outlined text-[18px]">{{ option.icon }}</span>
        </button>
      }
    </div>
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  readonly options = OPTIONS;
}
