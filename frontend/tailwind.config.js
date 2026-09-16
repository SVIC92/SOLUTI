/**
 * Sistema de diseño "SoluTI_AI" — extraído literalmente de las pantallas exportadas
 * desde Stitch (paleta pizarra/gris + acentos índigo/violeta para funciones de IA).
 * No modificar valores individuales sin actualizar también las plantillas: todas las
 * pantallas comparten este mismo token set.
 *
 * Temas (Claro/Oscuro/Black Neon): los tokens que sí se usan en la app están
 * enlazados a variables CSS (definidas por tema en `src/styles.scss` bajo
 * `[data-theme="..."]`) para poder cambiar de tema sin tocar las plantillas.
 * Los tokens del export de Stitch que ningún componente usa se dejan como
 * color fijo — no hace falta tematizar algo que no se renderiza.
 */

/** Helper del patrón oficial de Tailwind para variables CSS con soporte de opacidad
 * (`bg-primary/10` sigue funcionando porque la variable guarda "R G B" sin `rgb()`). */
function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variableName}))`;
    }
    return `rgb(var(${variableName}) / ${opacityValue})`;
  };
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Tokens tematizados (ligados a variables CSS) ---
        surface: withOpacity('--color-surface'),
        'surface-canvas': withOpacity('--color-surface-canvas'),
        'surface-card': withOpacity('--color-surface-card'),
        'surface-container': withOpacity('--color-surface-container'),
        'surface-container-low': withOpacity('--color-surface-container-low'),
        'surface-container-high': withOpacity('--color-surface-container-high'),
        'surface-elevated': withOpacity('--color-surface-elevated'),
        'on-surface': withOpacity('--color-on-surface'),
        'on-surface-variant': withOpacity('--color-on-surface-variant'),
        'on-secondary-container': withOpacity('--color-on-secondary-container'),
        primary: withOpacity('--color-primary'),
        'primary-container': withOpacity('--color-primary-container'),
        'on-primary': withOpacity('--color-on-primary'),
        secondary: withOpacity('--color-secondary'),
        'secondary-container': withOpacity('--color-secondary-container'),
        'secondary-fixed': withOpacity('--color-secondary-fixed'),
        tertiary: withOpacity('--color-tertiary'),
        'ai-purple': withOpacity('--color-ai-purple'),
        'ai-purple-subtle': withOpacity('--color-ai-purple-subtle'),
        'cyber-cyan': withOpacity('--color-cyber-cyan'),
        error: withOpacity('--color-error'),
        'error-container': withOpacity('--color-error-container'),
        'status-incident': withOpacity('--color-status-incident'),
        'status-incident-bg': withOpacity('--color-status-incident-bg'),
        'status-resolved': withOpacity('--color-status-resolved'),
        'status-resolved-bg': withOpacity('--color-status-resolved-bg'),
        'status-warning': withOpacity('--color-status-warning'),
        'status-warning-bg': withOpacity('--color-status-warning-bg'),
        'border-subtle': withOpacity('--color-border-subtle'),
        'border-strong': withOpacity('--color-border-strong'),

        // --- Resto del export de Stitch, sin uso actual en la app (color fijo) ---
        'surface-variant': '#d3e4fe',
        'inverse-primary': '#c3c0ff',
        'on-secondary-fixed': '#25005a',
        'surface-tint': '#4d44e3',
        'tertiary-fixed': '#c9e6ff',
        'on-secondary': '#ffffff',
        'on-tertiary': '#ffffff',
        'surface-container-lowest': '#ffffff',
        'on-tertiary-fixed': '#001e2f',
        'tertiary-fixed-dim': '#89ceff',
        'on-error': '#ffffff',
        'surface-dim': '#cbdbf5',
        'primary-fixed-dim': '#c3c0ff',
        background: '#f8f9ff',
        outline: '#777587',
        'on-primary-fixed': '#0f0069',
        'on-tertiary-container': '#b8e0ff',
        'primary-fixed': '#e2dfff',
        'on-primary-container': '#dad7ff',
        'surface-container-highest': '#d3e4fe',
        'surface-bright': '#f8f9ff',
        'tertiary-container': '#006693',
        'on-background': '#0b1c30',
        'inverse-surface': '#213145',
        'outline-variant': '#c7c4d8',
        'secondary-fixed-dim': '#d2bbff',
        'inverse-on-surface': '#eaf1ff',
        'on-error-container': '#93000a',
        'on-primary-fixed-variant': '#3323cc',
        'on-tertiary-fixed-variant': '#004c6e',
        'on-secondary-fixed-variant': '#5a00c6',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
      spacing: {
        'space-lg': '1rem',
        gutter: '1rem',
        'space-xl': '1.5rem',
        'space-2xs': '0.125rem',
        'space-sm': '0.5rem',
        margin: '1.5rem',
        'space-xs': '0.25rem',
        'margin-compact': '1rem',
        'space-md': '0.75rem',
        'space-2xl': '2rem',
        'gutter-compact': '0.75rem',
      },
      fontFamily: {
        'label-sm': ['"JetBrains Mono"', 'monospace'],
        'label-md': ['"JetBrains Mono"', 'monospace'],
        'code-mono': ['"JetBrains Mono"', 'monospace'],
        'headline-sm': ['"JetBrains Mono"', 'monospace'],
        'body-md': ['"JetBrains Mono"', 'monospace'],
        'headline-md': ['"JetBrains Mono"', 'monospace'],
        display: ['"JetBrains Mono"', 'monospace'],
        'body-sm': ['"JetBrains Mono"', 'monospace'],
        'label-lg': ['"JetBrains Mono"', 'monospace'],
        'body-lg': ['"JetBrains Mono"', 'monospace'],
        'headline-lg': ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'code-mono': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'headline-sm': ['16px', { lineHeight: '24px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-md': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'label-lg': ['13px', { lineHeight: '18px', fontWeight: '500' }],
        'body-lg': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
