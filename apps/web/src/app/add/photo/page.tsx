import { notFound } from 'next/navigation';
import { PHOTO_RECOGNITION_ENABLED } from '@/lib/features';
import { PhotoFlow } from './PhotoFlow';

/** Le parcours porte ses propres en-têtes : ils changent à chaque étape. */
export default function PhotoPage() {
  if (!PHOTO_RECOGNITION_ENABLED) {
    notFound();
  }
  return <PhotoFlow />;
}
