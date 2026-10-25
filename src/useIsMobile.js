import { useState, useEffect } from "react";

// True on phone-width screens. Updates live if the window is resized or rotated.
export function useIsMobile(query = "(max-width: 720px)") {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}