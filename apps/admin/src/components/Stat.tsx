import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Une tuile de chiffre clé, éventuellement cliquable vers son écran. */
export function Stat({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const card = (
    <Card className="h-full gap-1 py-4 transition-colors hover:bg-accent/40">
      <CardHeader className="gap-1 px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
