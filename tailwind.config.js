/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['Figtree_400Regular', 'system-ui', 'sans-serif'],
        light: ['Figtree_300Light', 'system-ui', 'sans-serif'],
        medium: ['Figtree_500Medium', 'system-ui', 'sans-serif'],
        semibold: ['Figtree_600SemiBold', 'system-ui', 'sans-serif'],
        bold: ['Figtree_700Bold', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

