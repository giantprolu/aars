'use client';

import { DumbbellIcon, SunIcon, UsersIcon, UtensilsIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AddFab } from './AddFab';

/**
 * Barre d'onglets basse, à quatre destinations.
 *
 * L'ajout n'y figure plus : c'est le bouton flottant du journal qui l'ouvre,
 * là où il sert plusieurs fois par jour.
 *
 * L'historique a quitté la barre quand la Cuisine et le Sport y sont entrés.
 * Ce qu'on ouvre tous les jours reste ici, ce qu'on consulte une fois par
 * semaine se rejoint depuis le journal, dont l'en-tête porte ce lien.
 */

interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Couleur de l'onglet actif : celle de son domaine. */
  active: string;
}

// Deux destinations de part et d'autre du bouton +, comme sur la maquette 5a.
const LEFT: Destination[] = [
  { href: '/', label: 'Aujourd’hui', icon: SunIcon, active: 'text-nutri-ink' },
  { href: '/kitchen', label: 'Cuisine', icon: UtensilsIcon, active: 'text-cook-ink' },
];
const RIGHT: Destination[] = [
  { href: '/training', label: 'Sport', icon: DumbbellIcon, active: 'text-sport-ink' },
  { href: '/training/community', label: 'Communauté', icon: UsersIcon, active: 'text-social-ink' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/history');
  }
  if (href === '/training') {
    return pathname.startsWith('/training') && !pathname.startsWith('/training/community');
  }
  return pathname.startsWith(href);
}

export function TabBar() {
  const pathname = usePathname();

  // L'écran de connexion n'a pas de navigation : rien n'est accessible.
  // Les chemins d'ajout non plus, qui portent leur propre sortie.
  if (
    pathname.startsWith('/unlock') ||
    pathname.startsWith('/legal') ||
    pathname.startsWith('/add') ||
    pathname.startsWith('/welcome')
  ) {
    return null;
  }

  return (
    /*
      Collante, et non fixe.
      Au lancement d'une application installée, iOS calcule le bloc conteneur
      des éléments fixes avant que la fenêtre n'ait sa taille définitive et ne
      le recalcule pas ensuite : la barre restait suspendue au-dessus du bord,
      un vide sous elle, jusqu'à la première navigation. La mise en page
      normale, elle, est bien reprise. La barre y revient donc : dernier
      élément d'une colonne haute d'au moins un écran, elle touche le bas
      quand la page est courte, et `sticky` l'y retient quand la page défile.

      Elle occupe dès lors sa propre place : plus de cale à tenir à jour
      derrière elle, donc plus de contenu masqué quand sa hauteur change.
      Une barre d'actions basse la remplace tant qu'elle est montée.
    */
    <nav
      aria-label="Navigation principale"
      className="sticky bottom-0 z-40 border-t bg-card/95 pb-[var(--safe-bottom)] [body:has([data-bottom-bar])_&]:hidden"
    >
      <div className="mx-auto flex h-[58px] max-w-lg items-center px-1">
        {LEFT.map((destination) => renderTab(destination, pathname))}
        <div className="flex flex-1 justify-center">
          <AddFab />
        </div>
        {RIGHT.map((destination) => renderTab(destination, pathname))}
      </div>
    </nav>
  );
}

function renderTab(destination: Destination, pathname: string) {
  const active = isActive(pathname, destination.href);
  const Icon = destination.icon;
  return (
    <Link
      key={destination.href}
      href={destination.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-11 flex-1 flex-col items-center justify-center gap-[3px] text-[10.5px] font-medium text-nav transition-colors',
        active && `font-bold ${destination.active}`,
      )}
    >
      <Icon aria-hidden className="size-[22px]" strokeWidth={1.9} />
      <span>{destination.label}</span>
    </Link>
  );
}
