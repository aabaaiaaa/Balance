"use client";

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/": "Balance",
  "/people": "People",
  "/life-areas": "Life Areas",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();

  const title = pageTitles[pathname] ?? "Balance";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white safe-area-top">
      <div className="mx-auto flex h-14 max-w-lg items-center px-4">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}
