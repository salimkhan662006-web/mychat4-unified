import { useState, useRef, useCallback } from "react";

/**
 * Reveals a full string progressively, word by word, with a small
 * randomized delay so it feels like natural typing rather than a
 * mechanical typewriter. Returns the current visible slice, whether
 * streaming is in progress, and a function to start streaming a new
 * full text.
 */
export function useStreamingText() {
  const [displayed, setDisplayed] = useState("");
  const [streaming, setStreaming] = useState(false);
  const timeoutRef = useRef(null);

  const stream = useCallback((fullText, onDone) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDisplayed("");
    setStreaming(true);

    const words = fullText.split(" ");
    let i = 0;

    function next() {
      if (i < words.length) {
        setDisplayed((prev) => prev + (i === 0 ? "" : " ") + words[i]);
        i++;
        const delay = 25 + Math.random() * 45;
        timeoutRef.current = setTimeout(next, delay);
      } else {
        setStreaming(false);
        if (onDone) onDone();
      }
    }

    next();
  }, []);

  return { displayed, streaming, stream };
}