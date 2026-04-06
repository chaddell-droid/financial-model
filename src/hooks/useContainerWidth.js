import { useState, useEffect } from 'react';

export default function useContainerWidth(ref, fallback = 800) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return Math.max(400, Math.min(width, 1200));
}
