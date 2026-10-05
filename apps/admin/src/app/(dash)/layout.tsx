import { AppSidebar } from '@/components/AppSidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { apiGet } from '@/lib/api';
import { requireSession } from '@/lib/auth';
import type { CatalogMeal, Overview } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const [overview, catalog] = await Promise.all([
    apiGet<Overview>('/overview'),
    apiGet<{ meals: CatalogMeal[] }>('/catalog'),
  ]);
  const badges = {
    recipes: overview.recipes.ownWithoutPhoto,
    catalog: catalog.meals.filter((meal) => meal.imageUrl === null).length,
    // Avant le déploiement du serveur qui les compte, les dossiers manquent : on retombe sur les signalements.
    reports: overview.openCases ?? overview.openReports,
  };

  return (
    <SidebarProvider>
      <AppSidebar badges={badges} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="text-sm text-muted-foreground">Aars admin</span>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
