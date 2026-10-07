'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { SnapshotProvider, useSnap } from '@/lib/useSnapshot';

function OnboardingGate() {
  const { snapshot, fresh } = useSnap();
  const router = useRouter();
  useEffect(() => {
    if (fresh && snapshot && !snapshot.profile) router.replace('/onboarding');
  }, [fresh, snapshot, router]);
  return null;
}

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SnapshotProvider>
      <OnboardingGate />
      <div className="mx-auto max-w-xl px-4 pb-28 pt-[max(env(safe-area-inset-top),8px)]">{children}</div>
      <BottomNav />
    </SnapshotProvider>
  );
}
