import React from 'react';

export const SchoolIllustration: React.FC<{ className?: string }> = ({ className = 'w-40 h-24' }) => {
  return (
    <svg
      viewBox="0 0 240 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Sun */}
      <circle cx="215" cy="30" r="16" fill="#FBBF24" opacity="0.9" />
      <circle cx="215" cy="30" r="22" stroke="#FDE68A" strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />

      {/* Lawn / Hills */}
      <ellipse cx="120" cy="142" rx="130" ry="24" fill="#10B981" />
      <ellipse cx="200" cy="138" rx="60" ry="18" fill="#059669" />
      <ellipse cx="40" cy="138" rx="55" ry="16" fill="#059669" />

      {/* Tree Left */}
      <rect x="22" y="70" width="8" height="50" rx="2" fill="#78350F" />
      <circle cx="26" cy="62" r="20" fill="#10B981" />
      <circle cx="20" cy="55" r="14" fill="#34D399" />
      <circle cx="34" cy="58" r="12" fill="#059669" />

      {/* Tree Right */}
      <rect x="205" y="75" width="7" height="45" rx="2" fill="#78350F" />
      <circle cx="208" cy="68" r="18" fill="#10B981" />
      <circle cx="202" cy="62" r="13" fill="#34D399" />
      <circle cx="215" cy="64" r="11" fill="#059669" />

      {/* Main Building Body */}
      <rect x="52" y="65" width="136" height="58" rx="4" fill="#EF4444" />
      <rect x="52" y="65" width="136" height="6" fill="#DC2626" />

      {/* Center Tower */}
      <rect x="100" y="38" width="40" height="85" rx="3" fill="#F87171" />
      <polygon points="120,10 94,40 146,40" fill="#B91C1C" />

      {/* Clock in Tower */}
      <circle cx="120" cy="48" r="8" fill="#FFFFFF" stroke="#B91C1C" strokeWidth="2" />
      <line x1="120" y1="48" x2="120" y2="44" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="120" y1="48" x2="124" y2="48" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" />

      {/* Left & Right Roofs */}
      <polygon points="50,65 96,65 90,52 56,52" fill="#B91C1C" />
      <polygon points="144,65 190,65 184,52 150,52" fill="#B91C1C" />

      {/* Main Center Door */}
      <rect x="110" y="88" width="20" height="35" rx="2" fill="#1E3A8A" />
      <rect x="112" y="90" width="7" height="15" fill="#93C5FD" />
      <rect x="121" y="90" width="7" height="15" fill="#93C5FD" />
      <circle cx="118" cy="108" r="1.5" fill="#FCD34D" />

      {/* Windows Left Wing */}
      <rect x="62" y="76" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="64" y="78" width="8" height="12" fill="#60A5FA" />
      <rect x="78" y="76" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="80" y="78" width="8" height="12" fill="#60A5FA" />

      <rect x="62" y="98" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="64" y="100" width="8" height="12" fill="#60A5FA" />
      <rect x="78" y="98" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="80" y="100" width="8" height="12" fill="#60A5FA" />

      {/* Windows Right Wing */}
      <rect x="150" y="76" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="152" y="78" width="8" height="12" fill="#60A5FA" />
      <rect x="166" y="76" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="168" y="78" width="8" height="12" fill="#60A5FA" />

      <rect x="150" y="98" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="152" y="100" width="8" height="12" fill="#60A5FA" />
      <rect x="166" y="98" width="12" height="16" rx="1" fill="#FFFFFF" />
      <rect x="168" y="100" width="8" height="12" fill="#60A5FA" />

      {/* Steps */}
      <rect x="105" y="122" width="30" height="3" fill="#E2E8F0" />
      <rect x="102" y="124" width="36" height="3" fill="#CBD5E1" />
    </svg>
  );
};
