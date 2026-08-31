import React, { useState, useEffect, useRef } from 'react';

const OVERWATCH_LOGO =
  'https://logos-world.net/wp-content/uploads/2020/05/Overwatch-Emblem.png';

const BackToTopButton: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const boostTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let inThrottle = false;

    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    const throttledToggleVisibility = () => {
      if (!inThrottle) {
        toggleVisibility();
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, 150);
      }
    };

    window.addEventListener('scroll', throttledToggleVisibility);

    return () => {
      window.removeEventListener('scroll', throttledToggleVisibility);
    };
  }, []);

  useEffect(
    () => () => {
      if (boostTimeout.current) {
        clearTimeout(boostTimeout.current);
      }
    },
    []
  );

  const scrollToTop = () => {
    if (boostTimeout.current) {
      clearTimeout(boostTimeout.current);
    }
    setIsBoosting(true);
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
    boostTimeout.current = setTimeout(() => {
      setIsBoosting(false);
    }, 1000);
  };

  return isVisible ? (
    <button
      onClick={scrollToTop}
      className={`back-to-top-button ${isBoosting ? 'is-boosting' : ''} print:hidden fixed right-6 bottom-6 sm:right-4 sm:bottom-4 w-12 h-12 rounded-full border-none font-semibold flex items-center justify-center cursor-pointer overflow-visible z-50 outline-none transition-all duration-300 ease-in-out transform hover:scale-95 active:scale-90`}
      aria-label="Back to top"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={OVERWATCH_LOGO}
        alt="Overwatch logo"
        width={64}
        height={64}
        className="back-to-top-icon w-8 h-8 object-contain drop-shadow pointer-events-none select-none"
        loading="lazy"
        draggable={false}
      />
      <span
        className="back-to-top-thruster absolute left-1/2 -translate-x-1/2"
        aria-hidden
      />
      <span className="back-to-top-text absolute left-1/2 bottom-2 -translate-x-1/2 text-white text-xs opacity-0 whitespace-nowrap transition-all duration-300 ease-in-out">
        Aller en haut
      </span>
    </button>
  ) : null;
};

export default BackToTopButton;
