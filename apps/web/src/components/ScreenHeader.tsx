import Link from 'next/link';
import { ChevronLeftIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Les deux en-têtes de l'application.
 *
 * `ScreenHeader` coiffe les destinations de la barre d'onglets : un titre, une
 * ligne de contexte en dessous, et une action secondaire à droite.
 *
 * Il accepte une destination secondaire, et une seule. UX-DR-3 écarte du tiers
 * supérieur les contrôles *fréquents*, pas toute cible : ce qu'on touche
 * plusieurs fois par jour appartient à la barre basse, ce qu'on ouvre une fois
 * par semaine n'y a pas sa place. L'historique est exactement de ce second
 * genre.
 *
 * `NavHeader` coiffe les écrans qu'on ouvre puis qu'on quitte. Il porte la
 * sortie et le nom de l'écran d'où l'on vient, jamais le titre : celui-ci est
 * rendu par le contenu, qui sait mieux ce qu'il montre.
 */

export function ScreenHeader({
  title,
  kicker,
  action,
}: {
  title: string;
  kicker?: string;
  /** Action secondaire, posée en regard du titre. Jamais un geste fréquent. */
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 pt-3 pb-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {kicker ? (
          <p className="mt-0.5 text-[13.5px] text-muted-foreground first-letter:uppercase">
            {kicker}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** Titre d'un écran ouvert depuis un autre, avec sa ligne de contexte. */
export function PageTitle({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-[22px] font-semibold tracking-tight first-letter:uppercase">{title}</h1>
      {description ? (
        <p className="mt-1 text-muted-foreground first-letter:uppercase">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * La sortie est une croix quand l'écran est un cul-de-sac que l'on referme, et
 * une flèche quand il s'inscrit dans un parcours dont on peut remonter d'un
 * cran. Les deux mènent au même endroit ; c'est la promesse qui diffère.
 */
export function NavHeader({
  label,
  href,
  onDismiss,
  mode = 'back',
  action,
}: {
  /** Nom de l'écran d'où l'on vient. */
  label: string;
  /** Destination de la sortie. Ignorée quand `onDismiss` est fourni. */
  href?: string;
  /** Sortie confiée à l'appelant, pour un retour à l'étape précédente. */
  onDismiss?: () => void;
  mode?: 'close' | 'back';
  /** Action secondaire, à droite. */
  action?: React.ReactNode;
}) {
  const icon = mode === 'back' ? <ChevronLeftIcon className="size-5" /> : <XIcon className="size-5" />;
  const accessibleLabel = mode === 'back' ? 'Revenir en arrière' : 'Fermer';

  return (
    <header className="flex h-14 items-center justify-between gap-2">
      <div className="-ml-2.5 flex min-w-0 items-center gap-1">
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={onDismiss}
            aria-label={accessibleLabel}
          >
            {icon}
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon-lg">
            <Link href={href ?? '/'} aria-label={accessibleLabel}>
              {icon}
            </Link>
          </Button>
        )}
        <span className="truncate text-[14.5px] font-medium">{label}</span>
      </div>
      {action ? <div className="-mr-2 flex items-center">{action}</div> : null}
    </header>
  );
}
