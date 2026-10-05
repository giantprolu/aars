import Image from 'next/image';
import { ImageOffIcon } from 'lucide-react';
import { CopyButton } from '@/components/CopyButton';
import { PageTitle } from '@/components/PageTitle';
import { PhotoUploader } from '@/components/PhotoUploader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { dishPrompt, fullPrompt } from '@/lib/prompts';
import type { AdminRecipe } from '@/lib/types';

export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

/**
 * Les recettes écrites ou importées par les comptes, sans photo d'abord. On
 * n'y voit pas à qui elles sont : seulement le plat, pour lui trouver une image.
 */
export default async function RecipesPage() {
  const { recipes } = await apiGet<{ recipes: AdminRecipe[] }>('/recipes');
  const missing = recipes.filter((recipe) => recipe.imageUrl === null).length;

  return (
    <>
      <PageTitle
        title="Recettes sans photo"
        description={`${missing} sans photo sur ${recipes.length} recettes écrites ou importées. La photo apparaît aussitôt dans l'app de la personne.`}
      />
      <Card className="gap-2">
        <CardHeader>
          <CardTitle className="text-base">Faire la photo avec Gemini</CardTitle>
          <CardDescription>
            1. « Copier le prompt » sur la recette. 2. Le coller dans Gemini (Nano Banana), puis télécharger
            l&apos;image. 3. « Ajouter une photo » et la choisir : les bords sont rognés à l&apos;envoi, ce qui
            retire l&apos;étoile de Gemini.
          </CardDescription>
        </CardHeader>
      </Card>
      {recipes.length === 0 ? (
        <p className="text-muted-foreground">Aucune recette écrite ou importée pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((recipe) => (
            <Card key={recipe.id} className="gap-3 overflow-hidden pt-0">
              <div className="relative aspect-[16/10] bg-muted">
                {recipe.imageUrl ? (
                  <Image src={recipe.imageUrl} alt="" fill unoptimized className="object-cover" sizes="(max-width: 640px) 100vw, 33vw" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOffIcon className="size-8" aria-hidden />
                  </div>
                )}
              </div>
              <CardHeader className="gap-1 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{recipe.name}</CardTitle>
                  {recipe.imageUrl === null ? <Badge variant="secondary">sans photo</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  n° {recipe.id} · {dateFormat.format(new Date(recipe.createdAt))} · {recipe.servings} part{recipe.servings > 1 ? 's' : ''}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                <p className="rounded-md bg-muted p-3 text-sm leading-relaxed">{dishPrompt(recipe)}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={fullPrompt(recipe)} />
                  <PhotoUploader kind="recipe" id={String(recipe.id)} hasPhoto={recipe.imageUrl !== null} removable />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
