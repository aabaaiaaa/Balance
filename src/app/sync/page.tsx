"use client";

import { useRouter } from "next/navigation";
import { SyncFlow } from "@/components/SyncFlow";

export default function SyncPage() {
  const router = useRouter();

  return (
    <SyncFlow
      onClose={() => router.back()}
    />
  );
}
