/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'system-ui', 'sans-serif'] },
      colors: {
        navy: {
          50: '#eef2f8', 100: '#d9e1ee', 200: '#b3c3dd', 300: '#8099c2', 400: '#4f6c9f',
          500: '#2f4d80', 600: '#203a66', 700: '#182d52', 800: '#13233f', 900: '#0d1a30', 950: '#081120',
        },
        gold: { 50: '#fbf6e6', 100: '#f5e9c2', 200: '#ecd689', 300: '#e0bf52', 400: '#d4ab2e', 500: '#b8901f', 600: '#937118' },
        mint: { 50: '#e9f7f1', 100: '#c9ecdd', 200: '#98dbbf', 400: '#3fb488', 500: '#1f9a6e', 600: '#177a57', 700: '#125f44' },
      },
      boxShadow: { soft: '0 1px 2px rgba(13,26,48,.06), 0 4px 16px rgba(13,26,48,.06)' },
    },
  },
  plugins: [],
}
