import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/** Un échec dit en une phrase, dans l'Alert destructive de shadcn/ui. */
export function ErrorAlert({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Alert variant="destructive" className={cn('mt-4', className)}>
      <CircleAlertIcon />
      <AlertTitle className="line-clamp-none font-normal">{children}</AlertTitle>
    </Alert>
  );
}
