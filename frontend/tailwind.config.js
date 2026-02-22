/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#f0f4ff',
                    100: '#dce6ff',
                    200: '#b9ceff',
                    300: '#89aeff',
                    400: '#5686ff',
                    500: '#3366ff',
                    600: '#1847f5',
                    700: '#1033e1',
                    800: '#1230b6',
                    900: '#142e8f',
                    950: '#0f1e60',
                },
                surface: {
                    900: '#0d0f18',
                    800: '#131626',
                    700: '#1a1e30',
                    600: '#212640',
                    500: '#2a2f4a',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
            },
            keyframes: {
                fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
                slideUp: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
            },
            backdropBlur: { xs: '2px' },
        },
    },
    plugins: [],
}
