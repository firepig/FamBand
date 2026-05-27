import { useState, useEffect, useMemo } from 'react';

const RAINBOW_COLORS = [
  '#FF6B6B',
  '#FFA94D',
  '#FFD43B',
  '#69DB7C',
  '#4DABF7',
  '#9775FA',
  '#DA77F2',
  '#F783AC',
];

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

export default function Confetti() {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const pieces = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${randomInRange(0, 100)}%`,
      color: RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)],
      size: randomInRange(6, 12),
      delay: randomInRange(0, 0.5),
      rotation: randomInRange(-180, 180),
    }));
  }, []);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
      {pieces.map((piece) => (
        <div
          key={piece.id}
          style={{
            position: 'absolute',
            left: piece.left,
            top: 0,
            width: piece.size,
            height: piece.size * 1.4,
            backgroundColor: piece.color,
            borderRadius: '2px',
            opacity: 0,
            animation: `confetti-fall 2.5s ease-in-out ${piece.delay}s forwards`,
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}
