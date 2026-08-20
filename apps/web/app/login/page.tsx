"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AppVersion } from "@/components/app-version";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/lib/queries/auth";
import { ApiError } from "@/lib/api/client";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync({ email: email.trim(), password });
      router.push("/dashboard");
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? "Nesprávný e-mail nebo heslo."
          : "Přihlášení se nezdařilo. Zkontroluj připojení.";
      toast.error(msg);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-scout-bg-app px-6 text-scout-text">
      <div className="w-full max-w-sm rounded-12 border border-scout-border bg-white p-6 shadow-sm">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-13 text-scout-text-muted hover:text-scout-text"
        >
          <ArrowLeft className="h-4 w-4" /> zpět
        </Link>

        <div className="mb-5 flex items-center gap-2">
          <span className="h-2.25 w-2.25 rounded-full bg-scout-yellow" />
          <span className="text-15 font-bold tracking-tightest text-scout-blue">Scout Scoring</span>
        </div>
        <h1 className="text-22 font-bold tracking-tight">Přihlášení organizátora</h1>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ty@oddil.cz"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
            {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Přihlásit se
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Registrace je pouze na pozvánku
          </p>
        </form>

        <div className="mt-6 text-center">
          <AppVersion />
        </div>
      </div>
    </main>
  );
}
