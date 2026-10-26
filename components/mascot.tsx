"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Reely's mascot: a round purple buddy with a play-button antenna whose eyes follow the pointer and blink.
 * `tone="light"` is the white version for purple backgrounds (the New research button).
 */
export function Mascot({
  size = 32,
  tone = "brand",
  className = "",
}: {
  size?: number;
  tone?: "brand" | "light";
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height * 0.55);
        const dist = Math.hypot(dx, dy) || 1;
        // Pupils move at most 2.6 units (of a 64-unit face), less when the pointer is close.
        const reach = Math.min(2.6, dist / 40);
        setLook({ x: (dx / dist) * reach, y: (dy / dist) * reach });
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const body = tone === "light" ? "#ffffff" : "var(--primary)";
  const face = tone === "light" ? "var(--primary)" : "#ffffff";
  const pupil = tone === "light" ? "#ffffff" : "#1a1033";

  return (
    <svg ref={ref} viewBox="0 0 64 64" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <radialGradient id={`shine-${id}`} cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity={tone === "light" ? 0 : 0.35} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Antenna with a play-button tip: "reels" */}
      <path d="M32 13 V6" stroke={body} strokeWidth="3" strokeLinecap="round" />
      <path d="M29 1.5 L37 6 L29 10.5 Z" fill={body} />
      {/* Body */}
      <ellipse cx="32" cy="38" rx="25" ry="23" fill={body} />
      <ellipse cx="32" cy="38" rx="25" ry="23" fill={`url(#shine-${id})`} />
      {/* Eyes (blink by squashing vertically) */}
      <g className="mascot-blink" style={{ transformOrigin: "32px 36px" }}>
        <ellipse cx="23" cy="36" rx="7" ry="8" fill={face} />
        <ellipse cx="41" cy="36" rx="7" ry="8" fill={face} />
        <circle cx={23 + look.x} cy={37 + look.y} r="3.4" fill={pupil} />
        <circle cx={41 + look.x} cy={37 + look.y} r="3.4" fill={pupil} />
        <circle cx={24.2 + look.x} cy={35.6 + look.y} r="1.1" fill={face} />
        <circle cx={42.2 + look.x} cy={35.6 + look.y} r="1.1" fill={face} />
      </g>
      {/* Smile and cheeks */}
      <path d="M27 49 Q32 53 37 49" stroke={face} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="15" cy="45" r="2.6" fill="#ff7ab6" opacity={tone === "light" ? 0.5 : 0.55} />
      <circle cx="49" cy="45" r="2.6" fill="#ff7ab6" opacity={tone === "light" ? 0.5 : 0.55} />
    </svg>
  );
}
