interface LexenaWordmarkProps {
  variant?: "dark" | "light";
  height?: number;
  className?: string;
  showSignalDot?: boolean;
}

export function LexenaWordmark({
  variant = "dark",
  height = 24,
  className,
  showSignalDot = true,
}: LexenaWordmarkProps) {
  const fg = variant === "dark" ? "#FFFFFF" : "#0D1B2A";
  const width = (220 / 36) * height;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 36"
      width={width}
      height={height}
      fill="none"
      className={className}
      role="img"
      aria-label="Lexena"
    >
      <circle cx="6" cy="18" r="4.5" fill={fg} />
      <line
        x1="15"
        y1="18"
        x2="33"
        y2="18"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <text
        x="41"
        y="25"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        fontSize="24"
        fontWeight="400"
        letterSpacing="-0.4"
        fill={fg}
      >
        lexena
      </text>
      {showSignalDot && <circle cx="214" cy="6" r="3.5" fill="#1D9E75" />}
    </svg>
  );
}
