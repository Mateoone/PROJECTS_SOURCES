/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Share Tech Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        hud: {
          bg: '#03070a',
          panel: 'rgba(7, 18, 22, 0.72)',
          emerald: '#10ffa0',
          amber: '#ffb347',
          yellow: '#fff04d',
          sky: '#5fd2ff',
          danger: '#ff4d5e',
          grid: 'rgba(16, 255, 160, 0.12)',
        },
      },
      boxShadow: {
        glow: '0 0 12px rgba(16, 255, 160, 0.35)',
        'glow-amber': '0 0 12px rgba(255, 179, 71, 0.35)',
        'glow-danger': '0 0 16px rgba(255, 77, 94, 0.55)',
      },
      animation: {
        scan: 'scan 4s linear infinite',
        flicker: 'flicker 3s linear infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '94%': { opacity: '0.6' },
          '96%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
