import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-scout-bg-app text-scout-text">
      <header className="border-b border-scout-border bg-white">
        <div className="container flex h-13 items-center justify-between">
          <div className="flex items-center gap-2 text-15 font-bold tracking-tightest text-scout-blue">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-scout-yellow" />
            Scout Scoring
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Přihlásit</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="bg-dashboard-hero text-white">
        <div className="container max-w-4xl py-16 sm:py-20">
        <p className="mb-4 text-12 uppercase tracking-0.6 text-white/55">
          Bodování závodu — bez papíru
        </p>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Skautský závod,
          <br />
          který <span className="scout-underline pb-0.5">prostě funguje</span>.
        </h1>
        <p className="mt-6 max-w-xl text-15 text-white/70">
          Organizátor spravuje závod v jedné obrazovce, rozhodčí se na stanovišti přihlásí QR kódem
          a zapisuje body do 10 sekund.<br /> Bez účtu. Bez školení. Bez papíru.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">
              Otevřít dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href="/station">Jsem rozhodčí — zápis bodů</Link>
          </Button>
        </div>
        </div>
      </section>
    </main>
  );
}
