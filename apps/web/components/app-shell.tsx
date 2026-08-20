"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppVersion } from "@/components/app-version";
import { ThemeToggle } from "@/components/theme-toggle";
import * as Auth from "@/lib/api/auth";
import type { Organizer } from "@/lib/api/types";
import { ReactNode } from "react";

export function AppShell({
  organizer,
  children,
  rightSlot,
}: {
  organizer: Organizer | null;
  children: ReactNode;
  rightSlot?: ReactNode;
}) {
  const router = useRouter();

  function onLogout() {
    Auth.logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-scout-yellow" />
            Scout Scoring
          </Link>

          <div className="flex items-center gap-2">
            {rightSlot}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Účet">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-normal">
                    <div className="text-sm font-medium">{organizer?.name ?? "Organizátor"}</div>
                    <div className="text-xs text-muted-foreground">{organizer?.email ?? ""}</div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Odhlásit se
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container py-8">{children}</main>

      <footer className="container flex justify-center pb-4">
        <AppVersion />
      </footer>
    </div>
  );
}
