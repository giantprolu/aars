import { redirect } from 'next/navigation';

/** Moi, en attendant son écran (story 15-7) : les réglages. */
export default function MePage() {
  redirect('/settings');
}
