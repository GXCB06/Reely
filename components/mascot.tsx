"use client";

import { useEffect, useId, useRef, useState } from "react";

type Mood = "idle" | "attentive" | "happy" | "surprised" | "sleepy" | "wink" | "curious";
type Eye = { w: number; h: number; dy: number; arc?: boolean };

// Eye shapes per mood, in a 100-unit face. `arc` swaps the pill for a happy "^" curve.
const EYES: Record<Mood, [Eye, Eye]> = {
  idle: [{ w: 9, h: 17, dy: 0 }, { w: 9, h: 17, dy: 0 }],
  attentive: [{ w: 10, h: 19, dy: -1 }, { w: 10, h: 19, dy: -1 }],
  happy: [{ w: 9, h: 0, dy: 0, arc: true }, { w: 9, h: 0, dy: 0, arc: true }],
  surprised: [{ w: 12, h: 21, dy: -2 }, { w: 12, h: 21, dy: -2 }],
  sleepy: [{ w: 11, h: 4, dy: 5 }, { w: 11, h: 4, dy: 5 }],
  wink: [{ w: 9, h: 17, dy: 0 }, { w: 9, h: 0, dy: 0, arc: true }],
  curious: [{ w: 8, h: 14, dy: 1 }, { w: 11, h: 20, dy: -2 }],
};
const IDLE_MOODS: Mood[] = ["happy", "surprised", "sleepy", "wink", "curious"];

const PALETTE = {
  // Purple ball with dark eyes (chat); white ball with purple eyes (on the purple New research button).
  brand: { hi: "#c3b2ff", mid: "#6b49d8", edge: "#3d2394", eye: "#140a2e", blush: "#ff8cc6" },
  light: { hi: "#ffffff", mid: "#f4f0ff", edge: "#cfc3f3", eye: "#3a2385", blush: "#ff9fcf" },
};

// One pointer listener for every mascot on the page.
type PointerFn = (x: number, y: number) => void;
const subscribers = new Set<PointerFn>();
let frame = 0;
function onPointer(e: PointerEvent) {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => subscribers.forEach((fn) => fn(e.clientX, e.clientY)));
}
function subscribe(fn: PointerFn) {
  if (!subscribers.size) window.addEventListener("pointermove", onPointer, { passive: true });
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) window.removeEventListener("pointermove", onPointer);
  };
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Reely: a round bot with simple pill eyes. On its own it glances around, blinks and pulls faces; when the
 * pointer comes near it looks at it, and smiles when the pointer is on it. `scanning` = looking around
 * quickly while a search runs. `tone="light"` is the white version for purple backgrounds.
 */
export function Mascot({
  size = 32,
  tone = "brand",
  scanning = false,
  className = "",
}: {
  size?: number;
  tone?: "brand" | "light";
  scanning?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId().replace(/:/g, "");
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [mood, setMood] = useState<Mood>("idle");
  const [blink, setBlink] = useState(false);
  const near = useRef(false);
  const c = PALETTE[tone];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };

    // Blink every few seconds, sometimes twice.
    const blinkLoop = () => {
      later(rand(2200, 5600), () => {
        setBlink(true);
        later(130, () => {
          setBlink(false);
          if (Math.random() < 0.2) later(160, () => (setBlink(true), later(120, () => setBlink(false))));
          blinkLoop();
        });
      });
    };

    // When nobody is near: glance somewhere, or pull a face for a moment.
    const idleLoop = () => {
      later(scanning ? rand(700, 1100) : rand(1800, 4200), () => {
        if (!near.current) {
          if (scanning) {
            setLook({ x: rand(-1, 1), y: rand(-0.6, 0.3) });
          } else if (Math.random() < 0.6) {
            setLook({ x: rand(-0.9, 0.9), y: rand(-0.7, 0.6) });
            later(rand(900, 1700), () => !near.current && setLook({ x: 0, y: 0 }));
          } else {
            setMood(IDLE_MOODS[Math.floor(Math.random() * IDLE_MOODS.length)]);
            later(rand(1200, 2000), () => !near.current && setMood("idle"));
          }
        }
        idleLoop();
      });
    };

    blinkLoop();
    idleLoop();

    // Follow the pointer only when it comes near; smile when it is on the mascot.
    const unsubscribe = subscribe((x, y) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || !box.width) return;
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height / 2);
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(150, box.width * 2.6);
      if (dist > radius) {
        if (near.current) {
          near.current = false;
          setLook({ x: 0, y: 0 });
          setMood("idle");
        }
        return;
      }
      near.current = true;
      const reach = Math.min(1, dist / (box.width * 0.9));
      setLook({ x: (dx / (dist || 1)) * reach, y: (dy / (dist || 1)) * reach });
      setMood(dist < box.width * 0.55 ? "happy" : "attentive");
    });

    return () => {
      timers.forEach(clearTimeout);
      unsubscribe();
    };
  }, [scanning]);

  const eyes = EYES[mood];
  const shadow = size >= 48;
  const ease = "0.18s ease-out";

  return (
    <svg ref={ref} viewBox="0 0 100 100" width={size} height={size} aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <defs>
        <radialGradient id={`body-${id}`} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor={c.hi} />
          <stop offset="0.55" stopColor={c.mid} />
          <stop offset="1" stopColor={c.edge} />
        </radialGradient>
      </defs>
      {shadow && <ellipse className="mascot-shadow" cx="50" cy="97" rx="24" ry="3" fill="#000" opacity="0.12" />}
      <g className="mascot-float">
        <g style={{ transform: `rotate(${look.x * 7}deg)`, transformOrigin: "50px 55px", transition: "transform 0.45s ease-out" }}>
          <circle cx="50" cy="50" r="44" fill={`url(#body-${id})`} />
          <ellipse cx="34" cy="25" rx="11" ry="6" fill="#fff" opacity={tone === "light" ? 0.9 : 0.28} transform="rotate(-28 34 25)" />
          <g style={{ transform: `translate(${look.x * 9}px, ${look.y * 7}px)`, transition: "transform 0.25s ease-out" }}>
            {eyes.map((eye, i) => {
              const cx = i === 0 ? 37 : 63;
              const h = blink && !eye.arc ? 2.5 : eye.h;
              const w = blink && !eye.arc ? eye.w + 2 : eye.w;
              return (
                <g key={i}>
                  <rect
                    fill={c.eye}
                    style={{
                      x: cx - w / 2,
                      y: 48 + eye.dy - h / 2,
                      width: w,
                      height: h,
                      rx: Math.min(w, h) / 2,
                      transition: `x ${ease}, y ${ease}, width ${ease}, height ${ease}, rx ${ease}`,
                    }}
                  />
                  <path
                    d={`M${cx - 6} 50 Q${cx} 41 ${cx + 6} 50`}
                    stroke={c.eye}
                    strokeWidth="4.5"
                    strokeLinecap="round"
                    fill="none"
                    style={{ opacity: eye.arc ? 1 : 0, transition: `opacity ${ease}` }}
                  />
                </g>
              );
            })}
            <ellipse cx="50" cy="66" rx="3.2" ry="3.8" fill={c.eye} style={{ opacity: mood === "surprised" ? 1 : 0, transition: `opacity ${ease}` }} />
            {[25, 75].map((cx) => (
              <ellipse
                key={cx}
                cx={cx}
                cy="61"
                rx="6.5"
                ry="3.6"
                fill={c.blush}
                style={{ opacity: mood === "happy" || mood === "wink" ? 0.6 : 0, transition: "opacity 0.3s" }}
              />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
