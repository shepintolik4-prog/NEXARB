/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   '#0a0a0f',
          secondary: '#111118',
          card:      '#16161f',
          hover:     '#1e1e2a',
          border:    '#2a2a3a',
        },
        accent: {
          green:  '#00e676',
          red:    '#ff3d57',
          blue:   '#4d9fff',
          yellow: '#ffd740',
          purple: '#bf5af2',
        },
        text: {
          primary:   '#f0f0f8',
          secondary: '#8888aa',
          muted:     '#555568',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-green': 'pulseGreen 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-up':    'slideUp 0.3s ease-out',
        'fade-in':     'fadeIn 0.2s ease-out',
      },
      keyframes: {
        pulseGreen: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.5' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}