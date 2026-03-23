import { useEffect, useState } from 'react';

export function useLaggedValue(value, delayMs = 0) {
  const [laggedValue, setLaggedValue] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setLaggedValue(value);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setLaggedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return laggedValue;
}
