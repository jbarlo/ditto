"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refreshes server component data when the page is restored from bfcache.
 * Drop this into a layout to ensure stale server data is re-fetched
 * when users navigate back via browser history.
 */
export default function BfcacheRefresh() {
  const router = useRouter();

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        router.refresh();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  return null;
}
