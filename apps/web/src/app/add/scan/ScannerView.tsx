import { ChevronLeftIcon, FlashlightIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import {
  isValidBarcode,
  startScanner,
  type CameraControls,
  type ScannerHandle,
} from '@/lib/client/scanner';
import type { ScanOutcome } from '@/lib/types';

/**
 * Viseur du scanner (FR-11, FR-16), en plein écran et toujours sombre : une
 * interface claire autour d'une image de caméra éblouit et écrase le contraste
 * du code visé.
 *
 * Le flux démarre au montage, ce montage étant lui-même la conséquence directe
 * de l'appui sur « Scanner » : c'est le geste utilisateur explicite qu'exige iOS.
 *
 * Le zoom et la torche ne sont affichés que si l'appareil les expose, et n'ont
 * rien de décoratif : sur un code de deux centimètres imprimé sur un opercule,
 * ou dans un placard mal éclairé, ils font la différence entre un décodage en
 * une seconde et un échec que l'utilisateur attribue à l'application.
 *
 * L'écran reste utilisable sans caméra. La saisie manuelle du code est toujours
 * accessible, pas seulement en repli après échec (EXPERIENCE.md, accessibilité).
 *
 * Pas de directive `use client` : ce composant n'est monté que depuis ScanFlow et
 * ScanToCheck, qui la portent déjà.
 */

/** Au-delà, l'application propose explicitement la saisie manuelle (FR-11). */
const HINT_AFTER_MS = 20_000;

/** Cadence du contrôle de l'aperçu, et nombre de passages avant de le dire. */
const PREVIEW_CHECK_MS = 1_000;
const PREVIEW_IDLE_TICKS = 3;

type Status =
  | { name: 'starting' }
  | { name: 'scanning' }
  /** Caméra rendue, aperçu noir : le navigateur attend un toucher. */
  | { name: 'stalled' }
  | { name: 'permission_denied' }
  | { name: 'unsupported' };

const NO_CONTROLS: CameraControls = { zoom: null, torch: false };

/** Les quatre coins du cadre de visée. */
const CORNERS = [
  'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
  'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
];

export function ScannerView({
  onBarcode,
  onClose,
  title = 'Scanner',
}: {
  onBarcode: (barcode: string) => void;
  /** Sortie confiée à l'appelant ; sans elle, le viseur ramène au journal. */
  onClose?: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const [status, setStatus] = useState<Status>({ name: 'starting' });
  const [controls, setControls] = useState<CameraControls>(NO_CONTROLS);
  const [zoom, setZoom] = useState<number | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [manual, setManual] = useState('');

  const handleOutcome = useCallback(
    (outcome: ScanOutcome) => {
      switch (outcome.kind) {
        case 'decoded':
          onBarcode(outcome.barcode);
          break;
        case 'permission_denied':
          setStatus({ name: 'permission_denied' });
          break;
        case 'unsupported':
          setStatus({ name: 'unsupported' });
          break;
        case 'stalled':
          setStatus((previous) =>
            previous.name === 'permission_denied' || previous.name === 'unsupported'
              ? previous
              : { name: 'stalled' },
          );
          break;
        case 'aborted':
          break;
      }
    },
    [onBarcode],
  );

  /**
   * Le viseur ne connaît de l'extérieur qu'une référence, jamais une dépendance.
   *
   * L'effet qui ouvre la caméra ne doit se jouer qu'une fois par montage. S'il
   * dépendait de `handleOutcome`, la moindre lambda passée en ligne par un
   * appelant — ou le simple rendu de son parent — le relancerait : arrêt du
   * flux, puis second `getUserMedia` pendant que le premier est encore en vol.
   * iOS refuse ce second appel et l'écran annonce une caméra indisponible,
   * alors que l'appareil n'a rien refusé. C'est ce qui arrivait au scan en
   * rayon, dont le parent se rend à nouveau dès l'ouverture.
   */
  const outcomeRef = useRef(handleOutcome);
  useEffect(() => {
    outcomeRef.current = handleOutcome;
  }, [handleOutcome]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    let cancelled = false;
    void startScanner({
      video,
      onOutcome: (outcome) => outcomeRef.current(outcome),
    }).then((handle) => {
      handleRef.current = handle;
      if (cancelled) {
        handle.stop();
        return;
      }
      setControls(handle.controls);
      setZoom(handle.controls.zoom?.min ?? null);
      setStatus((previous) => (previous.name === 'starting' ? { name: 'scanning' } : previous));
    });

    const hintTimer = setTimeout(() => setShowHint(true), HINT_AFTER_MS);

    // Le flux est coupé à la sortie d'écran, pas seulement au décodage (FR-11).
    return () => {
      cancelled = true;
      clearTimeout(hintTimer);
      handleRef.current?.stop();
      handleRef.current = null;
    };
    // Volontairement sans dépendance : voir la référence ci-dessus.
  }, []);

  /**
   * Contrôle de l'aperçu.
   *
   * `play()` peut se résoudre sans qu'aucune image n'arrive : seule la largeur
   * de la trame dit que la caméra donne vraiment. Trois passages à vide avant
   * de le signaler, pour ne pas accuser un démarrage simplement lent.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    let idle = 0;
    const timer = setInterval(() => {
      if (video.videoWidth > 0 && !video.paused) {
        idle = 0;
        setStatus((previous) => (previous.name === 'stalled' ? { name: 'scanning' } : previous));
        return;
      }
      idle += 1;
      if (idle >= PREVIEW_IDLE_TICKS) {
        setStatus((previous) => (previous.name === 'scanning' ? { name: 'stalled' } : previous));
      }
    }, PREVIEW_CHECK_MS);

    return () => clearInterval(timer);
  }, []);

  const cameraFailed = status.name === 'permission_denied' || status.name === 'unsupported';
  const manualValid = isValidBarcode(manual);

  function changeZoom(value: number) {
    setZoom(value);
    void handleRef.current?.setZoom(value);
  }

  function toggleTorch(next: boolean) {
    setTorchOn(next);
    void handleRef.current?.setTorch(next);
  }

  return (
    <div
      data-theme="dark"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0b0b0b] text-foreground"
    >
      {/* L'image de la caméra occupe tout le fond ; l'interface flotte dessus. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Viseur du scanner"
        className={cameraFailed ? 'hidden' : 'absolute inset-0 size-full object-cover'}
      />

      <div className="safe-top relative mx-auto flex w-full max-w-lg flex-1 flex-col">
        <header className="flex h-14 items-center justify-between px-3">
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={onClose}
              aria-label="Fermer le scanner"
            >
              <ChevronLeftIcon className="size-[21px]" />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon-lg">
              <Link href="/" aria-label="Fermer le scanner">
                <ChevronLeftIcon className="size-[21px]" />
              </Link>
            </Button>
          )}
          <span className="text-[14.5px] font-medium">{title}</span>
          {controls.torch ? (
            <Toggle
              pressed={torchOn}
              onPressedChange={toggleTorch}
              aria-label="Torche"
              size="lg"
              className="size-11"
            >
              <FlashlightIcon className="size-5" />
            </Toggle>
          ) : (
            <span aria-hidden className="size-11" />
          )}
        </header>

        {cameraFailed ? (
          <div className="flex flex-1 items-center px-5">
            <Alert>
              <AlertTitle>
                {status.name === 'permission_denied'
                  ? 'Accès à la caméra refusé.'
                  : 'Caméra indisponible sur cet appareil.'}
              </AlertTitle>
              <AlertDescription>
                {status.name === 'permission_denied' ? (
                  <p>Réactive-le dans Réglages, Safari, Appareil photo, puis recharge la page.</p>
                ) : null}
                <Button asChild variant="outline" className="mt-2">
                  <Link href="/add/search">Chercher par nom</Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : status.name === 'stalled' ? (
          <div className="flex flex-1 items-center px-5">
            <Alert>
              <AlertTitle>L’aperçu de la caméra ne démarre pas.</AlertTitle>
              <AlertDescription>
                <p>
                  Le téléphone a rendu la caméra, mais le navigateur attend un toucher pour
                  l’afficher.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void handleRef.current?.play().catch(() => undefined)}
                >
                  Activer la caméra
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div aria-hidden className="relative h-[170px] w-[270px]">
              <div className="absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]" />
              {CORNERS.map((corner) => (
                <span key={corner} className={`absolute size-7 border-white ${corner}`} />
              ))}
              <span className="absolute inset-x-0 top-1/2 h-px bg-white/55" />
            </div>
          </div>
        )}

        <div className="relative px-5 pb-[calc(2rem+var(--safe-bottom))]">
          {cameraFailed ? null : (
            <>
              <p className="mb-3.5 text-center text-[13.5px] text-white/70">
                {showHint
                  ? 'Code illisible ? Approche-toi, ou saisis-le ci-dessous.'
                  : 'Cadre le code-barres, la lecture est automatique.'}
              </p>

              {controls.zoom !== null ? (
                <div className="mb-3.5 flex items-center gap-3 px-1">
                  <Label htmlFor="zoom" className="text-white/70">
                    Zoom
                  </Label>
                  <Slider
                    id="zoom"
                    min={controls.zoom.min}
                    max={controls.zoom.max}
                    step={controls.zoom.step}
                    value={[zoom ?? controls.zoom.min]}
                    onValueChange={([value]) => value !== undefined && changeZoom(value)}
                    className="flex-1"
                  />
                </div>
              ) : null}
            </>
          )}

          <Card className="bg-card/90 backdrop-blur">
            <CardContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (manualValid) {
                    handleRef.current?.stop();
                    onBarcode(manual);
                  }
                }}
              >
                <Label htmlFor="barcode" className="mb-2 text-muted-foreground">
                  Ou saisis le code
                </Label>
                <Input
                  id="barcode"
                  name="barcode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={13}
                  placeholder="3 175 680 011 480"
                  value={manual}
                  onChange={(event) => setManual(event.target.value.replace(/\D/g, ''))}
                  className="tabular bg-transparent font-mono tracking-[0.06em]"
                />
                <Button type="submit" disabled={!manualValid} className="mt-2.5 w-full">
                  Chercher ce code
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
