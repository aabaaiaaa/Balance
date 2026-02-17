"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

// Lazy-load the DeviceTransferFlow — heavy component with QR/WebRTC dependencies
const DeviceTransferFlow = dynamic(
  () => import("@/components/DeviceTransferFlow").then((m) => ({ default: m.DeviceTransferFlow })),
  { loading: () => <div className="flex items-center justify-center py-12"><p className="text-sm text-gray-400 dark:text-slate-500">Loading transfer...</p></div> }
);

export default function DeviceTransferPage() {
  const router = useRouter();

  return (
    <DeviceTransferFlow
      onClose={() => router.back()}
    />
  );
}
