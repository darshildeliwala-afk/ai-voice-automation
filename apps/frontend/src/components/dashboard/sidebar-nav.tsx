"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { mainNavItems, secondaryNavItems, type NavItem } from "@/lib/navigation";

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {item.title}
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-4">
      <div className="space-y-1">
        {mainNavItems.map((item) => (
          <div key={item.href} onClick={onNavigate}>
            <NavLink item={item} />
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
        {secondaryNavItems.map((item) => (
          <div key={item.href} onClick={onNavigate}>
            <NavLink item={item} />
          </div>
        ))}
      </div>
    </nav>
  );
}
