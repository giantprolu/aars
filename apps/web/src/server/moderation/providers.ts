import 'server-only';
import { POLICY_VERSION } from '@/lib/moderation/config';
import { detectLinks } from '@/lib/moderation/links';
import { normalizeText } from '@/lib/moderation/normalize';
import { detectWithRules, type TextField } from '@/lib/moderation/rules';
import type { Detection } from '@/lib/moderation/types';

/**
 * Les fournisseurs de détection, derrière une interface commune par modalité.
 *
 * Aujourd'hui, tout est local : les règles pour le texte, l'analyse de forme
 * pour les liens. Aucune IA, aucun service tiers (décision du 05/10/2026).
 * L'interface est là pour qu'un autre détecteur — un modèle d'image le jour
 * où l'app en montrera, une base de réputation de domaines — se branche sans
 * rien changer au reste : il rendra des `Detection`, et le moteur de
 * politique décidera comme pour les autres. Un détecteur ne sanctionne jamais.
 */

export type Modality = 'text' | 'link' | 'image' | 'video' | 'audio';

export interface ProviderOutcome {
  provider: string;
  version: string;
  detections: Detection[];
}

export interface ModerationProvider<Input> {
  readonly name: string;
  readonly version: string;
  readonly modality: Modality;
  classify(input: Input): Promise<ProviderOutcome>;
}

export interface TextInput {
  text: string;
  field: TextField;
}

export type TextModerationProvider = ModerationProvider<TextInput>;
export type LinkModerationProvider = ModerationProvider<TextInput>;

/** Un fichier montré aux autres. Aucune implémentation : l'app ne partage ni image, ni vidéo, ni son. */
export interface MediaInput {
  url: string;
  mimeType: string;
}

export type ImageModerationProvider = ModerationProvider<MediaInput>;
export type VideoModerationProvider = ModerationProvider<MediaInput>;
export type AudioModerationProvider = ModerationProvider<MediaInput>;

/**
 * Réputation d'un domaine : âge, présence sur une liste de domaines
 * malveillants. Aucune source n'est branchée ; l'analyse des liens se fait
 * sur leur forme seule (`lib/moderation/links.ts`).
 */
export interface DomainReputation {
  lookup(host: string): Promise<{ ageDays: number | null; listed: boolean } | null>;
}

export const RULES_VERSION = `rules-${POLICY_VERSION}`;

export const localTextProvider: TextModerationProvider = {
  name: 'local-rules',
  version: RULES_VERSION,
  modality: 'text',
  classify: async ({ text, field }) => ({
    provider: 'local-rules',
    version: RULES_VERSION,
    detections: detectWithRules(text, field).detections,
  }),
};

export const localLinkProvider: LinkModerationProvider = {
  name: 'local-links',
  version: RULES_VERSION,
  modality: 'link',
  classify: async ({ text }) => ({
    provider: 'local-links',
    version: RULES_VERSION,
    detections: detectLinks(normalizeText(text).plain),
  }),
};

/** Les fournisseurs appliqués à un texte public, dans l'ordre. */
export const TEXT_PROVIDERS: readonly ModerationProvider<TextInput>[] = [localTextProvider, localLinkProvider];
