import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#f6851b',
          deep: '#e2761b',
        },
        ink: {
          DEFAULT: '#24272a',
          2: '#535a61',
        },
        line: {
          DEFAULT: '#d6d9dc',
          soft: '#e7eaed',
        },
        bg: '#f2f4f6',
      },
      borderRadius: {
        card: '14px',
        device: '26px',
      },
      fontFamily: {
        sans: ['"Euclid Circular B"', '"Segoe UI"', 'system-ui', '-apple-system', '"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif'],
      },
    },
  },
} satisfies Config