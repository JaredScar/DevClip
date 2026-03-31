/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        devclip: {
          bg: '#121212',
          card: '#1a1a1a',
          muted: '#9ca3af',
          accent: '#00c853',
        },
      },
      boxShadow: {
        overlay: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('lite', 'html.devclip-light &');
    },
  ],
};
