import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'frontend';

  // Se inyecta aquí (raíz de la app) para que el tema persistido se aplique
  // antes de renderizar cualquier ruta, evitando un parpadeo al tema claro.
  private readonly theme = inject(ThemeService);
}
