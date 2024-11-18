import React, { memo } from 'react';

const Particles = () => {
  const particles = Array.from({ length: 20 }).map((_, i) => {
    const style = {
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 5}s`,
    };
    return <div key={i} className="particle" style={style} />;
  });

  return <>{particles}</>;
};

const AnimatedBackground = () => {
  return (
    <div className="fixed top-0 left-0 w-full h-full z-0">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black">
        <div className="grid-animation"></div>
        <Particles />
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default memo(AnimatedBackground);