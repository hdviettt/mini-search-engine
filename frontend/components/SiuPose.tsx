export default function SiuPose({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`siu-entrance ${className}`}
    >
      {/* Left boot */}
      <ellipse cx="68" cy="270" rx="12" ry="6" fill="#d4a843" />
      <rect x="60" y="262" width="16" height="10" rx="3" fill="#d4a843" />

      {/* Right boot */}
      <ellipse cx="132" cy="270" rx="12" ry="6" fill="#d4a843" />
      <rect x="124" y="262" width="16" height="10" rx="3" fill="#d4a843" />

      {/* Left sock */}
      <rect x="62" y="230" width="12" height="34" rx="5" fill="#c0392b" />

      {/* Right sock */}
      <rect x="126" y="230" width="12" height="34" rx="5" fill="#c0392b" />

      {/* Left leg (green shorts visible) */}
      <rect x="64" y="180" width="14" height="54" rx="6" fill="#d4a276" />
      <rect x="62" y="175" width="18" height="28" rx="6" fill="#1a6b3c" />

      {/* Right leg (green shorts visible) */}
      <rect x="122" y="180" width="14" height="54" rx="6" fill="#d4a276" />
      <rect x="120" y="175" width="18" height="28" rx="6" fill="#1a6b3c" />

      {/* Shorts waistband */}
      <rect x="72" y="168" width="56" height="22" rx="6" fill="#1a6b3c" />

      {/* Torso / Jersey */}
      <path
        d="M74 170 C74 170 72 108 78 95 L122 95 C128 108 126 170 126 170 Z"
        fill="#c0392b"
      />

      {/* Jersey collar */}
      <rect x="88" y="88" width="24" height="10" rx="4" fill="#a52d24" />

      {/* Number 7 on back */}
      <text
        x="100"
        y="148"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize="36"
        fill="#d4a843"
      >
        7
      </text>

      {/* Left arm — spread wide to the left and slightly back */}
      <path
        d="M78 102 L42 86 L16 92"
        stroke="#c0392b"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Left hand */}
      <circle cx="14" cy="92" r="6" fill="#d4a276" />

      {/* Right arm — spread wide to the right and slightly back */}
      <path
        d="M122 102 L158 86 L184 92"
        stroke="#c0392b"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right hand */}
      <circle cx="186" cy="92" r="6" fill="#d4a276" />

      {/* Neck */}
      <rect x="93" y="78" width="14" height="14" rx="4" fill="#d4a276" />

      {/* Head (from behind — oval) */}
      <ellipse cx="100" cy="62" rx="20" ry="22" fill="#d4a276" />

      {/* Hair */}
      <ellipse cx="100" cy="55" rx="19" ry="18" fill="#1a1a1a" />
      {/* Hair sides */}
      <rect x="81" y="50" width="6" height="16" rx="3" fill="#1a1a1a" />
      <rect x="113" y="50" width="6" height="16" rx="3" fill="#1a1a1a" />
    </svg>
  );
}
