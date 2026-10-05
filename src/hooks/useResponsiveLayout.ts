import { useEffect, useMemo, useState } from 'react';

export type Breakpoint = 'compact' | 'standard' | 'tablet' | 'desktop';

export interface ResponsiveLayout {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  /** Viewports below `md` (768px) render the single-pane mobile layout. */
  isMobile: boolean;
  /** 768px and above: sidebar can collapse into an icon dock, splits allowed. */
  isTablet: boolean;
  /** 1024px and above: full three column desktop layout. */
  isDesktop: boolean;
  /** 390px and above: bottom navigation shows icon + 10px labels. */
  showsNavLabels: boolean;
  /** Primary pointer is coarse (touch). */
  isTouch: boolean;
  /** Safe-area inset for the bottom bar. */
  safeBottom: number;
}

const readBreakpoint = (width: number): Breakpoint => {
  if (width < 390) return 'compact';
  if (width < 768) return 'standard';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

/** Tracks viewport metrics and input capability for the responsive shell. */
export function useResponsiveLayout(): ResponsiveLayout {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const onPointerChange = (event: MediaQueryListEvent) => setIsTouch(event.matches);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    mediaQuery.addEventListener('change', onPointerChange);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      mediaQuery.removeEventListener('change', onPointerChange);
    };
  }, []);

  return useMemo(() => {
    const breakpoint = readBreakpoint(width);
    const safeBottom =
      typeof window === 'undefined'
        ? 0
        : Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom') || '0',
          ) || 0;

    return {
      width,
      height,
      breakpoint,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      showsNavLabels: width >= 390,
      isTouch,
      safeBottom,
    };
  }, [width, height, isTouch]);
}

export default useResponsiveLayout;