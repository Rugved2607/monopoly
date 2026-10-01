/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: { 950: '#120e2e', 900: '#1b1640', 800: '#241d55', 700: '#322a6b', 600: '#463c86' },
        marigold: { 300: '#ffd166', 400: '#ffbf2f', 500: '#f6a609', 600: '#d98a00' },
        sindoor: { 400: '#ef5a4a', 500: '#d8372b', 600: '#b72a20' },
        peacock: { 300: '#3cc0b8', 400: '#16a39c', 500: '#0d8f8a', 700: '#0a5b63', 900: '#073b45' },
        paper: { 50: '#fffdf7', 100: '#fbf4e3', 200: '#f2e6c8' },
      },
      fontFamily: {
        display: ['"Rozha One"', 'Georgia', 'serif'],
        sans: ['Mukta', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.92)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        sheet: { '0%': { transform: 'translateY(24px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(246,166,9,.7)' }, '100%': { boxShadow: '0 0 0 14px rgba(246,166,9,0)' } },
      },
      animation: {
        pop: 'pop .18s ease-out',
        sheet: 'sheet .22s ease-out',
        pulseRing: 'pulseRing 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
