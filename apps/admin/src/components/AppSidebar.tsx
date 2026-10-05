'use client';

import {
  BarChart3Icon,
  BookImageIcon,
  CreditCardIcon,
  FlagIcon,
  ImageOffIcon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const MONITORING = [
  { href: '/', label: 'Vue d’ensemble', icon: LayoutDashboardIcon },
  { href: '/usage', label: 'Usage', icon: BarChart3Icon },
  { href: '/abonnements', label: 'Abonnés', icon: CreditCardIcon },
] as const;

const CONTENT = [
  { href: '/recettes', label: 'Recettes sans photo', icon: ImageOffIcon, badge: 'recipes' },
  { href: '/catalogue', label: 'Catalogue', icon: BookImageIcon, badge: 'catalog' },
  { href: '/moderation', label: 'Modération', icon: FlagIcon, badge: 'reports' },
] as const;

/** La navigation : à gauche sur ordinateur, en tiroir sur téléphone. */
export function AppSidebar({ badges }: { badges: { recipes: number; catalog: number; reports: number } }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const item = (entry: { href: string; label: string; icon: typeof LayoutDashboardIcon }, badge?: number) => (
    <SidebarMenuItem key={entry.href}>
      <SidebarMenuButton asChild isActive={active(entry.href)} tooltip={entry.label}>
        <Link href={entry.href} onClick={() => setOpenMobile(false)}>
          <entry.icon aria-hidden />
          <span>{entry.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm text-primary-foreground">A</span>
          <span className="group-data-[collapsible=icon]:hidden">Aars admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Monitoring</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{MONITORING.map((entry) => item(entry))}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Contenu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{CONTENT.map((entry) => item(entry, badges[entry.badge]))}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>{item({ href: '/securite', label: 'Sécurité', icon: ShieldCheckIcon })}</SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
