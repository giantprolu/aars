import Link from 'next/link';
import {
  BarcodeIcon,
  CameraIcon,
  ChevronRightIcon,
  CookingPotIcon,
  PencilIcon,
  SearchIcon,
  StarIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PHOTO_RECOGNITION_ENABLED } from '@/lib/features';

/**
 * Les chemins d'ajout, partagés entre la feuille du journal et l'écran
 * /add. L'ordre est celui de la fréquence d'usage réelle, pas celui de
 * l'implémentation.
 *
 * Les quatre premiers cherchent un aliment ; le dernier part d'un plat déjà
 * écrit dans le carnet. Il vient après la recherche et avant la photo : on
 * mange ses propres recettes plus souvent qu'on ne photographie une assiette,
 * mais moins souvent qu'on ne scanne un produit.
 *
 * Les favoris passent en tête : quand un repas s'y trouve, c'est qu'on le
 * refait presque chaque jour, et c'est alors le chemin le plus court de tous.
 */

interface Mode {
  href: string;
  label: string;
  hint: string;
  badge?: { text: string; variant: 'default' | 'outline' };
  icon: React.ReactNode;
}

const MODES: Mode[] = [
  {
    href: '/add/favorites',
    label: 'Mes favoris',
    hint: 'Un repas déjà noté, d’un appui',
    icon: <StarIcon />,
  },
  {
    href: '/add/scan',
    label: 'Scanner',
    hint: 'Code-barres d’un produit',
    badge: { text: 'Le plus rapide', variant: 'default' },
    icon: <BarcodeIcon />,
  },
  {
    href: '/add/search',
    label: 'Rechercher',
    hint: 'CIQUAL et produits scannés',
    icon: <SearchIcon />,
  },
  {
    href: '/add/recipe',
    label: 'Mes recettes',
    hint: 'Un plat du carnet, en parts',
    icon: <CookingPotIcon />,
  },
  ...(PHOTO_RECOGNITION_ENABLED
    ? [
        {
          href: '/add/photo',
          label: 'Photo',
          hint: 'Reconnaissance sur l’assiette',
          badge: { text: 'Bêta', variant: 'outline' },
          icon: <CameraIcon />,
        } satisfies Mode,
      ]
    : []),
  {
    href: '/add/manual',
    label: 'Saisir à la main',
    hint: 'Valeurs pour 100 g',
    icon: <PencilIcon />,
  },
];

export function AddModes({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {MODES.map((mode) => (
        <li key={mode.href}>
          <Card asChild className="flex-row items-center gap-3 px-4 py-3 shadow-none">
            <Link
              href={mode.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className="min-h-14 transition-colors active:bg-accent"
            >
              <span
                aria-hidden
                className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted [&_svg]:size-[19px]"
              >
                {mode.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[14.5px] font-medium">{mode.label}</span>
                  {mode.badge ? (
                    <Badge variant={mode.badge.variant}>{mode.badge.text}</Badge>
                  ) : null}
                </span>
                <span className="mt-px block text-[12.5px] text-muted-foreground">{mode.hint}</span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
