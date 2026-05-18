/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        roomard: {
          50: '#e6f4f1',
          100: '#bfe1d9',
          500: '#0a4a3f',
          700: '#073529',
          900: '#031a15',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
