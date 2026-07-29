"use client";

import { useState } from "react";
import { Bell, Bot, Menu, Search } from "lucide-react";

import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="lg:hidden" />
          }
        >
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b border-sidebar-border px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              VoiceFlow
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative hidden flex-1 md:block md:max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search orders, calls, agents..."
          className="pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="relative">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          <span className="sr-only">Notifications</span>
        </Button>

        <div className="hidden items-center gap-3 rounded-lg border px-3 py-1.5 sm:flex">
          <Avatar size="sm">
            <AvatarFallback>DD</AvatarFallback>
          </Avatar>
          <div className="text-left">
            <p className="text-sm font-medium leading-none">Darshil Deliwala</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
