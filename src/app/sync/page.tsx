"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

// Lazy-load the SyncFlow — heavy component with QR/WebRTC dependencies
const SyncFlow = dynamic(
  () => import("@/components/SyncFlow").then((m) => ({ default: m.SyncFlow })),
  { loading: () => <div className="flex items-center justify-center py-12"><p className="text-sm text-gray-400 dark:text-slate-500">Loading sync...</p></div> }
);

export default function SyncPage() {
  const router = useRouter();

  return (
    <SyncFlow
      onClose={() => router.push("/")}
    />
  );
}
