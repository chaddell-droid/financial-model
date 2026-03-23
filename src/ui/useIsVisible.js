import { useState, useEffect, useRef } from 'react';

/**
 * Returns [ref, isVisible] — attach ref to a DOM element.
 * isVisible becomes true once the element enters the viewport
 * and stays true (no re-hide) to avoid re-mounting heavy components.
 */
export function useIsVisible(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px', ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return [ref, visible];
}
