import { Card } from '@/components/ui/card';

/** Une marche à suivre numérotée, une étape par rangée de carte. */
export function StepList({
  steps,
  renderExtra,
}: {
  steps: readonly string[];
  /** Ce qui suit le texte d'une étape, comme l'icône qu'elle nomme. */
  renderExtra?: (index: number) => React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ol>
        {steps.map((step, index) => (
          <li key={step} className="flex items-baseline gap-3 border-b px-4 py-3 last:border-b-0">
            <span
              aria-hidden
              className="tabular flex size-6 flex-none translate-y-[-1px] items-center justify-center self-start rounded-full bg-muted text-[12px] font-semibold"
            >
              {index + 1}
            </span>
            <span className="flex-1 leading-relaxed">
              {step}
              {renderExtra?.(index)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
