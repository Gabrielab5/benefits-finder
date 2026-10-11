'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { syncDevice } from '@/lib/push/client';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { SnapshotProvider, useSnap } from '@/lib/useSnapshot';

function OnboardingGate() {
  const { snapshot, fresh } = useSnap();
  const router = useRouter();
  useEffect(() => {
    if (fresh && snapshot && !snapshot.profile) router.replace('/onboarding');
  }, [fresh, snapshot, router]);
  return null;
}

/** Drops push left on this browser by another account (shared device), so it never shows their alerts. */
function PushOwnerCheck() {
  useEffect(() => {
    if ('serviceWorker' in navigator) syncDevice(supabaseBrowser()).catch(() => {});
  }, []);
  return null;
}

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SnapshotProvider>
      <OnboardingGate />
      <PushOwnerCheck />
      <div className="mx-auto max-w-xl px-4 pb-28 pt-[max(env(safe-area-inset-top),8px)]">{children}</div>
      <BottomNav />
    </SnapshotProvider>
  );
}
