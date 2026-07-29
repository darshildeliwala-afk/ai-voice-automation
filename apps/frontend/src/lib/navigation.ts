import {
  BarChart3,
  BookOpen,
  Bot,
  LayoutDashboard,
  Phone,
  Plug,
  Settings,
  ShoppingCart,
  User,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Orders", href: "/orders", icon: ShoppingCart },
  { title: "AI Agents", href: "/agents", icon: Bot },
  { title: "Call History", href: "/call-history", icon: Phone },
  { title: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
  { title: "Integrations", href: "/integrations", icon: Plug },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
];

export const secondaryNavItems: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Profile", href: "/profile", icon: User },
];
