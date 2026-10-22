"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ReprocessadosLiveRefresh() {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    lastRefreshAt.current = Date.now();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt.current < 30_000) return;
      lastRefreshAt.current = now;
      router.refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, 120_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [router]);

  return null;
}
