'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DayTotals } from '@/lib/types';
import { DayRow } from './DayRow';

/** Chargement progressif au-delà de la première page (FR-20). */
const PAGE_SIZE = 30;

export function LoadMore({ initialOffset }: { initialOffset: number }) {
  const [days, setDays] = useState<DayTotals[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/history?offset=${offset}&limit=${PAGE_SIZE}`);
      if (!response.ok) {
        setError('Chargement impossible.');
        return;
      }
      const body = (await response.json()) as { days: DayTotals[] };
      setDays((previous) => [...previous, ...body.days]);
      setOffset((previous) => previous + body.days.length);
      setExhausted(body.days.length < PAGE_SIZE);
    } catch {
      setError('Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {days.length > 0 ? (
        <ul>
          {days.map((day) => (
            <DayRow key={day.entryDate} day={day} />
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      ) : null}

      {exhausted ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadMore()}
          disabled={loading}
          className="mt-4 w-full"
        >
          {loading ? 'Chargement…' : 'Jours précédents'}
        </Button>
      )}
    </>
  );
}
