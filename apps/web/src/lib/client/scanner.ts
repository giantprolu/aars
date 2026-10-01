import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { ScanOutcome } from '../types';
import { isValidBarcode } from '../barcode';

/**
 * Scanner de code-barres dans le navigateur (FR-11).
 *
 * Le flux caméra ne démarre qu'à l'appel explicite de `startScanner`, jamais au
 * chargement de l'écran : iOS exige un geste utilisateur, et une caméra qui
 * s'allume toute seule est une mauvaise surprise.
 *
 * Les échecs sont modélisés en variantes plutôt que levés (AD-12) : l'interface
 * doit pouvoir proposer le bon repli selon la cause.
 *
 * Trois réglages décident du taux de décodage réel, et la première version les
 * laissait tous au hasard :
 *
 *   1. la définition demandée. Par défaut le navigateur sert du 640 × 480, où
 *      les barres fines d'un EAN-13 photographié à trente centimètres tombent
 *      sous le pixel. On demande donc la plus haute définition disponible ;
 *   2. la mise au point. Sans `focusMode: continuous`, la caméra reste sur sa
 *      distance d'origine et l'image est floue de près, précisément là où l'on
 *      tient un paquet ;
 *   3. la zone analysée. Décoder toute l'image revient à chercher un code qui
 *      n'occupe qu'un vingtième des pixels. On analyse d'abord la bande visée,
 *      celle que le cadre montre à l'écran.
 *
 * Le zoom optique et la torche, quand l'appareil les expose, sont rendus à
 * l'interface : sur un code minuscule ou dans une réserve mal éclairée, ce sont
 * les deux seuls leviers qui restent à l'utilisateur.
 */

/** Seuls formats acceptés (FR-11). Les autres symbologies sont ignorées. */
const ACCEPTED_FORMATS = ['EAN-13', 'EAN-8', 'UPC-A'] as const;

/** Cadence d'analyse. Plus rapide n'améliore pas le décodage et chauffe le téléphone. */
const FRAME_INTERVAL_MS = 250;

/**
 * Part de la hauteur de l'image retenue pour la bande visée. Plus large que le
 * cadre affiché, qui n'est qu'une invitation à viser et non une frontière : un
 * code posé juste au-dessus doit être lu quand même.
 */
const BAND_HEIGHT_RATIO = 0.42;

/**
 * Une analyse sur quatre porte sur l'image entière. La bande couvre le cas
 * ordinaire, ce balayage rattrape le code tenu de travers ou hors du cadre,
 * sans payer le coût de l'image complète à chaque trame.
 */
const FULL_FRAME_EVERY = 4;

/** Attente maximale des métadonnées de l'aperçu avant de tenter la lecture. */
const METADATA_TIMEOUT_MS = 2_000;

/** Le wasm est servi depuis public/, copié par scripts/copy-zxing-wasm.mjs. */
const WASM_PATH = '/zxing/zxing_reader.wasm';

let modulePrepared = false;

function prepareModule(): void {
  if (modulePrepared) {
    return;
  }
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? WASM_PATH : `${prefix}${path}`,
    },
  });
  modulePrepared = true;
}

/**
 * Réexporté pour les appelants qui l'employaient déjà d'ici.
 *
 * L'implémentation vit désormais dans `@/lib/barcode`, pur : la frontière HTTP
 * doit pouvoir contrôler un code-barres sans embarquer le décodeur
 * WebAssembly que ce fichier importe en tête.
 */
export { isValidBarcode };

/**
 * Le zoom et la torche ne figurent pas dans les types standards du DOM : ce
 * sont des extensions, largement servies mais non normalisées. On les décrit
 * ici plutôt que de renoncer au typage.
 */
interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

interface ExtendedCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
}

interface ExtendedConstraintSet {
  zoom?: number;
  torch?: boolean;
  focusMode?: string;
}

/** Ce que la caméra de cet appareil sait faire, une fois le flux ouvert. */
export interface CameraControls {
  /** Bornes du zoom optique, ou `null` quand l'appareil n'en expose pas. */
  zoom: ZoomRange | null;
  /** Vrai quand la torche est pilotable. */
  torch: boolean;
}

export interface ScannerHandle {
  /** Arrête le flux et libère les pistes (FR-11). Idempotent. */
  stop: () => void;
  /**
   * Relance la lecture de l'aperçu. À appeler depuis un geste utilisateur :
   * c'est le seul contexte où WebKit accepte à coup sûr de démarrer une
   * vidéo qu'il a refusée une première fois.
   */
  play: () => Promise<void>;
  /** Ce que la caméra accepte de piloter. Figé une fois le flux ouvert. */
  controls: CameraControls;
  /** Applique un facteur de zoom, silencieux si l'appareil refuse. */
  setZoom: (value: number) => Promise<void>;
  /** Allume ou éteint la torche, silencieux si l'appareil refuse. */
  setTorch: (on: boolean) => Promise<void>;
}

export interface StartScannerOptions {
  video: HTMLVideoElement;
  onOutcome: (outcome: ScanOutcome) => void;
}

const NO_CONTROLS: CameraControls = { zoom: null, torch: false };

/** Poignée inerte, pour les sorties d'échec : l'appelant n'a pas à tester null. */
function inertHandle(stop: () => void): ScannerHandle {
  return {
    stop,
    play: async () => {},
    controls: NO_CONTROLS,
    setZoom: async () => {},
    setTorch: async () => {},
  };
}

/**
 * Démarrage de l'aperçu, écrit pour WebKit.
 *
 * Sur iPhone, et particulièrement depuis l'écran d'accueil, trois détails
 * séparent un aperçu qui s'affiche d'un rectangle noir :
 *
 *   1. l'élément doit être muet et en lecture sur place *avant* de recevoir le
 *      flux. WebKit tranche à l'affectation ; une vidéo qu'il juge sonore ne
 *      démarrera pas sans geste utilisateur, et React ne pose pas toujours
 *      l'attribut `muted` dans le document ;
 *   2. `play()` appelé avant les métadonnées laisse l'élément noir sans jamais
 *      rejeter — l'attente est donc explicite ;
 *   3. le refus de `play()` doit remonter. Avalé, il donne exactement ce que
 *      l'on voyait : le cadre de visée sur fond noir, et aucune explication.
 */
async function startPlayback(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('autoplay', 'true');

  video.srcObject = stream;

  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve) => {
      // Le délai borne l'attente : un appareil qui n'émet jamais l'événement
      // ne doit pas suspendre le démarrage pour autant.
      const timer = setTimeout(resolve, METADATA_TIMEOUT_MS);
      video.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  await video.play();
}

function readControls(track: MediaStreamTrack): CameraControls {
  // `getCapabilities` manque encore sur Firefox : son absence n'est pas une
  // erreur, seulement l'absence de réglages fins.
  if (typeof track.getCapabilities !== 'function') {
    return NO_CONTROLS;
  }

  const capabilities = track.getCapabilities() as ExtendedCapabilities;
  const zoom = capabilities.zoom;

  return {
    zoom:
      zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min
        ? { min: zoom.min, max: zoom.max, step: zoom.step ?? 0.1 }
        : null,
    torch: capabilities.torch === true,
  };
}

/** Applique une contrainte hors norme sans faire échouer l'appelant. */
async function apply(track: MediaStreamTrack, set: ExtendedConstraintSet): Promise<void> {
  try {
    await track.applyConstraints({
      advanced: [set as MediaTrackConstraintSet],
    });
  } catch {
    // L'appareil a le droit de refuser : le scan continue sans ce réglage.
  }
}

export async function startScanner({
  video,
  onOutcome,
}: StartScannerOptions): Promise<ScannerHandle> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    onOutcome({ kind: 'unsupported' });
    return inertHandle(() => {});
  }

  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let analysing = false;
  let tick = 0;

  function stop() {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    // Libérer les pistes éteint le voyant de la caméra : sans cela, iOS la
    // laisse allumée après la navigation.
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    video.srcObject = null;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        // Souhaits, non exigences : un appareil qui ne sait pas servir cette
        // définition rend la sienne au lieu de refuser le flux.
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    onOutcome(
      name === 'NotAllowedError' || name === 'SecurityError'
        ? { kind: 'permission_denied' }
        : { kind: 'unsupported' },
    );
    return inertHandle(stop);
  }

  if (stopped) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return inertHandle(stop);
  }

  await startPlayback(video, stream).catch(() => {
    // Le décodage continue de tourner : si l'aperçu finit par démarrer, rien
    // n'est perdu. L'interface, elle, propose sa relance au toucher.
    onOutcome({ kind: 'stalled' });
  });

  const [track] = stream.getVideoTracks();
  const controls = track === undefined ? NO_CONTROLS : readControls(track);

  if (track !== undefined) {
    // La mise au point continue est demandée après l'ouverture : plusieurs
    // navigateurs la rejettent quand elle figure dans getUserMedia.
    await apply(track, { focusMode: 'continuous' });
  }

  prepareModule();

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    stop();
    onOutcome({ kind: 'unsupported' });
    return inertHandle(stop);
  }

  timer = setInterval(() => {
    if (stopped || analysing) {
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      return;
    }

    tick += 1;
    const wholeFrame = tick % FULL_FRAME_EVERY === 0;
    const bandHeight = wholeFrame ? height : Math.round(height * BAND_HEIGHT_RATIO);
    const top = wholeFrame ? 0 : Math.round((height - bandHeight) / 2);

    analysing = true;
    canvas.width = width;
    canvas.height = bandHeight;
    // La bande est recopiée à l'échelle 1 : redimensionner ferait perdre les
    // barres fines, qui sont précisément ce qu'il faut distinguer.
    context.drawImage(video, 0, top, width, bandHeight, 0, 0, width, bandHeight);

    void readBarcodes(context.getImageData(0, 0, width, bandHeight), {
      formats: [...ACCEPTED_FORMATS],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    })
      .then((results) => {
        if (stopped) {
          return;
        }
        const hit = results.find(
          (result) => result.isValid && isValidBarcode(result.text),
        );
        if (hit) {
          // Le flux s'arrête dès le décodage (FR-11).
          stop();
          onOutcome({ kind: 'decoded', barcode: hit.text });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        analysing = false;
      });
  }, FRAME_INTERVAL_MS);

  return {
    stop,
    play: async () => {
      if (!stopped) {
        await video.play();
      }
    },
    controls,
    setZoom: async (value: number) => {
      if (track === undefined || stopped || controls.zoom === null) {
        return;
      }
      const { min, max } = controls.zoom;
      await apply(track, { zoom: Math.min(max, Math.max(min, value)) });
    },
    setTorch: async (on: boolean) => {
      if (track === undefined || stopped || !controls.torch) {
        return;
      }
      await apply(track, { torch: on });
    },
  };
}
