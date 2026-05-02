/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        mist: '#f7f9fb',
        line: '#dbe3ea',
        brand: '#2563eb',
        pine: '#0f766e',
        amber: '#b45309'
      },
      boxShadow: {
        calm: '0 18px 60px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
