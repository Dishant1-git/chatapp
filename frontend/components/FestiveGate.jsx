'use client';

import dynamic from 'next/dynamic';
import { useFestival } from '@/lib/festivals';

// Fetched only on a festival day
const Festive = dynamic(() => import('./Festive'), { ssr: false });

// 🪔 Sits in the root layout, so every page dresses up for a festival — the
// login and sign-up pages as much as the chats (see lib/festivals.js)
export default function FestiveGate() {
  const festival = useFestival();
  return festival ? <Festive festival={festival} /> : null;
}
