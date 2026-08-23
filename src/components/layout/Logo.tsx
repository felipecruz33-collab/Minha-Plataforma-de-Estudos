export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A4AE0" />
          <stop offset="100%" stopColor="#3A8BFD" />
        </linearGradient>
      </defs>
      <g transform="translate(50 58)">
        <path d="M-31 -4 L0 8 L31 -4 L31 12 L0 24 L-31 12 Z" fill="url(#logo-gradient)" opacity="0.85" />
        <path
          d="M-31 -4 L0 -16 L31 -4 L0 8 Z"
          fill="none"
          stroke="url(#logo-gradient)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(50 33)">
        <path d="M-18 2 L0 -6 L18 2 L0 10 Z" fill="#D4A94A" />
        <circle cx="18" cy="2" r="1.6" fill="#D4A94A" />
        <line x1="18" y1="2" x2="18" y2="9" stroke="#D4A94A" strokeWidth="1.4" />
      </g>
    </svg>
  )
}
