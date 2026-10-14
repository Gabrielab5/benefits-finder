'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { Loading } from '@/components/ui';
import { syncDevice } from '@/lib/push/client';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { SnapshotProvider, useSnap } from '@/lib/useSnapshot';

/**
 * Sends a brand-new user to onboarding. Until the fresh snapshot says whether there's a profile, a user without a
 * cached one sees the loader, not a flash of home. A cached profile shows at once; offline or failed loads fall through.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { snapshot, fresh, online, error } = useSnap();
  const router = useRouter();
  useEffect(() => {
    if (fresh && snapshot && !snapshot.profile) router.replace('/onboarding');
  }, [fresh, snapshot, router]);
  return !snapshot?.profile && (fresh || (online && !error)) ? <Loading /> : children;
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
      <PushOwnerCheck />
      <div className="mx-auto max-w-xl px-4 pb-28 pt-[max(env(safe-area-inset-top),8px)]">
        <OnboardingGate>{children}</OnboardingGate>
      </div>
      <BottomNav />
    </SnapshotProvider>
  );
}
