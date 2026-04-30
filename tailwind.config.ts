import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#05010a',
        violetGlow: '#a855f7'
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(168, 85, 247, 0.18), 0 20px 60px rgba(0, 0, 0, 0.45)'
      }
    }
  },
  plugins: []
};

export default config;
