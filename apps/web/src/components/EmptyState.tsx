/** État vide : une phrase, pas d'illustration, pas d'appel à l'action. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-muted-foreground">{children}</p>;
}
