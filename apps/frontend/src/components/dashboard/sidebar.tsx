import { Bot } from "lucide-react";

import { SidebarNav } from "@/components/dashboard/sidebar-nav";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">
            VoiceFlow
          </p>
          <p className="text-xs text-muted-foreground">AI Automation</p>
        </div>
      </div>
      <SidebarNav />
    </aside>
  );
}
