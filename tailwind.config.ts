import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B0F2E',
          light: '#12163C',
        },
        brand: {
          indigo: '#4A4AE0',
          blue: '#3A8BFD',
          gold: '#D4A94A',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #4A4AE0 0%, #3A8BFD 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
