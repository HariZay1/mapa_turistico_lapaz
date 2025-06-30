

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'lapaz-blue': '#3498db',
        'lapaz-red': '#e74c3c',
        'lapaz-green': '#2ecc71',
        'lapaz-purple': '#9b59b6',
        'lapaz-orange': '#e67e22',
        'lapaz-yellow': '#f1c40f',
        'lapaz-dark': '#2c3e50',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '20px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}