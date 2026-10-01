import 'server-only';
import type { SearchHit } from '@/lib/types';
import {
  MIN_QUERY_LENGTH,
  SIMILARITY_THRESHOLD,
  searchReferenceFoods,
} from '../db/queries/search';

/** Service de recherche (FR-7, FR-18). */

export { MIN_QUERY_LENGTH, SIMILARITY_THRESHOLD };

export function search(term: string, limit?: number): Promise<SearchHit[]> {
  return searchReferenceFoods(term, limit);
}
