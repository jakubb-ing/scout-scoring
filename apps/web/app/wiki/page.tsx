import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Wiki — Scout Scoring",
  description: "Popis funkcí Scout Scoring pro admina, organizátora, stanoviště i doprovod hlídek.",
};

type Section = {
  id: string;
  title: string;
  lead?: string;
  blocks: Block[];
};

type Block =
  | { kind: "text"; body: string }
  | { kind: "list"; title?: string; items: string[] }
  | { kind: "steps"; title?: string; items: { name: string; body: string }[] }
  | { kind: "table"; title?: string; head: string[]; rows: string[][] }
  | { kind: "note"; tone: "info" | "warn"; body: string };

const SECTIONS: Section[] = [
  {
    id: "prehled",
    title: "Co aplikace řeší",
    lead:
      "Scout Scoring nahrazuje papírové bodovací karty na skautském závodě. Organizátor si závod nachystá v dashboardu, rozhodčí na stanovišti se přihlásí naskenováním QR kódu a zapisuje body z mobilu, doprovod hlídky přidá slovní hodnocení a účastníci se na konci podívají na výsledkovou listinu.",
    blocks: [
      {
        kind: "list",
        title: "Čtyři skupiny lidí, čtyři vstupy do aplikace",
        items: [
          "**Administrátor** — zakládá účty organizátorů, spravuje uživatele celé instance. Přihlašuje se emailem a heslem.",
          "**Organizátor** — vlastní nebo spravuje konkrétní závod: hlídky, stanoviště, kategorie, spuštění a uzavření závodu, výsledky. Přihlašuje se emailem a heslem.",
          "**Rozhodčí na stanovišti** — nemá účet. Naskenuje QR kód stanoviště a zapisuje body.",
          "**Doprovod hlídky** — nemá účet. Naskenuje QR kód hlídky a vyplní slovní zpětnou vazbu.",
        ],
      },
      {
        kind: "note",
        tone: "info",
        body:
          "Účet je potřeba jen pro admina a organizátora. Rozhodčí i doprovod se dostanou dovnitř výhradně přes QR kód s PINem, který je vázaný na jeden konkrétní závod a po uzavření závodu přestane fungovat.",
      },
    ],
  },
  {
    id: "zivotni-cyklus",
    title: "Životní cyklus závodu",
    lead:
      "Závod prochází čtyřmi stavy. Stav určuje, co kdo smí — proto je dobré ho znát dřív než jednotlivé obrazovky.",
    blocks: [
      {
        kind: "steps",
        items: [
          {
            name: "1 · Příprava (draft)",
            body:
              "Organizátor zakládá kategorie, hlídky a stanoviště, nastavuje kritéria bodování. Nic se ještě nedá zapisovat, žádné PINy neexistují.",
          },
          {
            name: "2 · Připraveno (ready)",
            body:
              "Tlačítko „Připravit ke spuštění“ vydá PINy a QR kódy pro stanoviště i pro doprovod hlídek — karty se dají vytisknout. Stanoviště jdou dál upravovat, u hlídek jen název a členové; nové hlídky se už nepřidávají. Kdo QR načte, uvidí obrazovku „závod ještě nebyl spuštěn“, která si sama hlídá start.",
          },
          {
            name: "3 · Běží (active)",
            body:
              "Rozhodčí zapisují body, doprovod vyplňuje zpětnou vazbu, organizátor sleduje průběh v dashboardu a live aktivitě.",
          },
          {
            name: "4 · Uzavřeno (closed)",
            body:
              "Zápis bodů ze stanovišť se zastaví. Body jdou opravit už jen záložkou „Opravy“ s povinným důvodem. Výsledky se zveřejní, okno pro zpětnou vazbu doprovodu zůstává otevřené ještě 12 hodin.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warn",
        body:
          "Ze stavu „Připraveno“ se dá vrátit zpět do přípravy. **Uzavření závodu je nevratné** — aplikace se před ním ptá potvrzovacím dialogem. Opakovaná příprava už vydané PINy nezneplatní, takže jednou vytištěné karty platí dál.",
      },
    ],
  },
  {
    id: "admin",
    title: "Administrátor",
    lead:
      "Systémový admin je organizátor s příznakem `is_admin`. Navíc ke všem právům organizátora spravuje uživatele celé instance na stránce /users.",
    blocks: [
      {
        kind: "list",
        title: "Co admin umí",
        items: [
          "**Založit uživatele** — vyplní jméno, email a heslo. Aplikace neposílá emaily, takže heslo se zobrazí po vytvoření a admin ho předá osobně.",
          "**Povýšit na admina** — přepínač u uživatele; admin vidí a spravuje všechny účty.",
          "**Resetovat heslo** — vygeneruje nové heslo pro uživatele, který se nemůže dostat dovnitř.",
          "**Upravit nebo smazat účet** — změna jména či emailu, odebrání přístupu.",
          "**Vidět, ke kterým závodům má uživatel přístup** — v detailu uživatele je seznam jeho závodů s rolí (vlastník / editace / čtení).",
        ],
      },
      {
        kind: "note",
        tone: "info",
        body:
          "Stránka /users je dostupná jen adminovi — běžný organizátor je z ní přesměrovaný zpátky na dashboard.",
      },
    ],
  },
  {
    id: "organizator",
    title: "Organizátor",
    lead:
      "Dashboard na /dashboard je hlavní pracovní obrazovka. Nahoře je přepínač závodů, stav závodu a tlačítka pro posun závodu dál; pod tím záložky.",
    blocks: [
      {
        kind: "list",
        title: "Role na závodě",
        items: [
          "**Vlastník** — kdo závod založil. Má plná práva včetně sdílení a uzavření.",
          "**Editace** — smí měnit hlídky, stanoviště i nastavení.",
          "**Čtení** — vidí všechno, ale editace je uzamčená (aplikace to hlásí páskou „Máš přístup jen pro čtení“).",
        ],
      },
      {
        kind: "steps",
        title: "Záložky dashboardu",
        items: [
          {
            name: "Přehled",
            body:
              "Dvě tabulky vedle sebe: postup hlídek (kolik stanovišť má hotovo, celkem bodů, poslední aktivita) a průběh stanovišť (kolik hlídek zpracovalo, kolik zbývá) s pruhy dokončení. Nad tím dlaždice s počty hlídek a stanovišť.",
          },
          {
            name: "Live aktivita",
            body:
              "Chronologický proud posledních zápisů bodů ze stanovišť — kdo, kde, kolik bodů a kdy. Slouží ke sledování závodu v reálném čase a k rychlému odhalení stanoviště, které nezapisuje.",
          },
          {
            name: "Hlídky",
            body:
              "Přidání hlídky ručně nebo import CSV se sloupci `start_number, name, category, members`. U hlídky se eviduje startovní číslo, název, kategorie a členové. Hlídku, která se nedostavila, lze **stáhnout ze závodu** (zůstane v datech, vypadne z výsledkovky) a případně vrátit zpět. Tady se také tisknou QR karty pro doprovod a resetuje se PIN hlídky.",
          },
          {
            name: "Stanoviště",
            body:
              "Definice stanovišť: název, pořadí, kritéria bodování s maximem bodů a přepínač půlbodů. Kritéria se rozhodčímu zobrazí jako formulář. Stanoviště se dá deaktivovat, znovu vydat PIN a vytisknout „Login Cards“ — karty s QR kódem, které se rozdají rozhodčím.",
          },
          {
            name: "Opravy",
            body:
              "Objeví se u uzavřeného závodu. Matice hlídka × stanoviště, kde jde doplnit chybějící hodnocení nebo opravit zapsané — vždy s povinným důvodem. Pod tím panel „Historie změn“ (audit log) s exportem do CSV; původní hodnoty zůstávají zachované.",
          },
          {
            name: "Nastavení",
            body:
              "Základní údaje (název, datum, místo), kategorie, model bodování a měření času, sdílení závodu s dalšími organizátory, odkaz na veřejné výsledky s přístupovým kódem a nastavení zpětné vazby od doprovodu.",
          },
        ],
      },
      {
        kind: "table",
        title: "Nastavení závodu podrobněji",
        head: ["Volba", "Co dělá"],
        rows: [
          ["Kategorie", "Každá kategorie má vlastní výsledkovku — typicky dívčí, chlapecké a nesoutěžní."],
          ["Model bodování", "Součet bodů, součet pořadí, nebo body s časem jako tiebreaker."],
          ["Měření času", "Žádné, na každém stanovišti, nebo jen start a cíl."],
          ["Sdílení závodu", "Přidání dalšího organizátora podle emailu s právem čtení nebo editace."],
          ["Veřejné výsledky", "Odkaz s přístupovým kódem (např. JARO2026). Kód lze kdykoli přegenerovat — starý odkaz tím přestane platit."],
          ["Zpětná vazba", "Zapnutí funkce, počet polí „Co se povedlo“ a „Prostor pro zlepšení“ (0–10) a přepínač, zda se hodnocení ukáže i ve veřejných výsledcích (výchozí: ne)."],
        ],
      },
      {
        kind: "list",
        title: "Import stanovišť pomocí AI",
        items: [
          "Do dialogu se nahraje dokument s propozicemi závodu (do 5 MB).",
          "AI z něj vytáhne návrh stanovišť s kritérii a doplňujícími otázkami.",
          "Organizátor otázky zodpoví, návrh se zpřesní a teprve pak se stanoviště uloží — nic nevzniká bez potvrzení.",
        ],
      },
    ],
  },
  {
    id: "stanoviste",
    title: "Stanoviště — rozhodčí",
    lead:
      "Mobilní obrazovka pro zápis bodů. Rozhodčí nemá účet ani heslo; přístup dává QR kód na kartě stanoviště.",
    blocks: [
      {
        kind: "steps",
        title: "Průběh na stanovišti",
        items: [
          {
            name: "Přihlášení",
            body:
              "Naskenováním QR kódu se otevře /station/<id> s PINem v odkazu a rozhodčí je rovnou přihlášený. Bez karty jde na /station vybrat závod a stanoviště ručně a PIN opsat. První přihlášení vyžaduje připojení k síti.",
          },
          {
            name: "Výběr hlídky",
            body:
              "Seznam hlídek závodu s vyhledáváním podle startovního čísla i názvu. U hlídek, které už na stanovišti byly, je vidět „Zapsáno“, u rozepsaných offline zápisů „Uloženo lokálně“.",
          },
          {
            name: "Zápis bodů",
            body:
              "Formulář s kritérii daného stanoviště. Body se zadávají v celých číslech, nebo po půl bodu, pokud to stanoviště povoluje. Podle nastavení závodu se doplní čas příchodu a odchodu ve formátu HH:MM. Aplikace hlídá maximum bodů i formát času.",
          },
          {
            name: "Odeslání",
            body:
              "Online se zápis rovnou uloží do databáze. Offline padne do fronty a odešle se sám, jakmile se objeví signál — rozhodčí může pokračovat na další hlídku.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warn",
        body:
          "Když je závod už uzavřený, zápis nelze odeslat a aplikace to řekne narovinu: body jdou upravit už jen přes záložku „Opravy“ v dashboardu. Takový zápis se ale **nezahodí** — zůstane ve frontě a je z čeho ho opsat.",
      },
      {
        kind: "list",
        title: "Stavy, které rozhodčí uvidí",
        items: [
          "**Bez připojení** — indikátor v hlavičce; zápisy se ukládají lokálně.",
          "**Zápis čeká na odeslání** — počet položek ve frontě.",
          "**Zápis vyžaduje řešení** — odeslání selhalo kvůli uzavřenému závodu nebo vypršenému přihlášení; je potřeba se znovu přihlásit nebo předat body organizátorovi.",
          "**Závod ještě nebyl spuštěn** — karta funguje, ale závod je teprve ve stavu „Připraveno“; obrazovka si start hlídá sama.",
        ],
      },
    ],
  },
  {
    id: "doprovod",
    title: "Doprovod hlídek — zpětná vazba",
    lead:
      "Volitelná funkce. Doprovod hlídky (vedoucí, který jde s dětmi) sepíše slovní hodnocení závodu na /feedback/<id>. Organizátor ji může celou vypnout.",
    blocks: [
      {
        kind: "steps",
        title: "Jak to probíhá",
        items: [
          {
            name: "Vstup přes QR kartu hlídky",
            body:
              "QR kód z karty hlídky otevře formulář přímo pro tu hlídku. Bez PINu z karty se dovnitř nedá dostat; první otevření potřebuje síť.",
          },
          {
            name: "Vyplnění",
            body:
              "N polí „Co se povedlo“ a M polí „Prostor pro zlepšení“ — počty určuje organizátor v nastavení závodu. Text se průběžně sám ukládá, takže se nedá ztratit.",
          },
          {
            name: "Odeslání",
            body:
              "Tlačítkem „Uzavřít a odeslat“ se hodnocení potvrdí (aplikace se ještě jednou zeptá) a dál je jen ke čtení.",
          },
          {
            name: "Souběh dvou zařízení",
            body:
              "Když formulář otevře někdo druhý, uvidí, že hodnocení právě vyplňuje jiné zařízení, a může vyplňování explicitně převzít — nic se nepřepíše nepozorovaně.",
          },
        ],
      },
      {
        kind: "list",
        title: "Co s tím dělá organizátor",
        items: [
          "Vidí odeslaná hodnocení u jednotlivých hlídek.",
          "Může odeslané hodnocení **vrátit k editaci** — obsah přitom sám editovat nesmí.",
          "Rozhoduje, zda se hodnocení objeví i ve veřejných výsledcích; ve výchozím stavu zůstává neveřejné.",
          "Může hlídce resetovat PIN, pokud se karta ztratila.",
        ],
      },
      {
        kind: "note",
        tone: "info",
        body:
          "Okno pro vyplnění je otevřené do 12 hodin po uzavření závodu (vrácení k editaci ho prodlouží). Po jeho vypršení formulář hlásí, že čas už vypršel.",
      },
    ],
  },
  {
    id: "vysledky",
    title: "Výsledky",
    lead:
      "Výsledkovka je oddělená od dashboardu, aby se dala poslat účastníkům bez toho, aby kdokoli potřeboval účet.",
    blocks: [
      {
        kind: "list",
        items: [
          "Pořadí se počítá **zvlášť pro každou kategorii** podle zvoleného modelu bodování.",
          "Stažené hlídky se do pořadí nepočítají a jsou označené jako „nedostavila se“.",
          "Detail hlídky ukazuje rozpad bodů po stanovištích a rozdíl proti nejlepšímu.",
          "Odkaz je chráněný přístupovým kódem, který zadá návštěvník při prvním otevření.",
          "Výsledky jdou vytisknout, součástí tisku je i QR kód na online verzi.",
          "U opravených bodů je vidět, že byly upraveny, a kdy — bez důvodu a bez jména.",
        ],
      },
    ],
  },
  {
    id: "offline",
    title: "Offline režim",
    lead:
      "Stanoviště na louce sotva chytá signál, takže obrazovky pro rozhodčí i doprovod fungují i bez připojení.",
    blocks: [
      {
        kind: "list",
        items: [
          "Aplikace je PWA — dá se přidat na plochu telefonu a spustit jako běžná aplikace.",
          "Seznam hlídek a kritéria stanoviště se drží v paměti zařízení, takže se načtou i bez sítě.",
          "Zápisy bodů i rozepsaná zpětná vazba jdou do fronty a odešlou se automaticky po obnovení signálu.",
          "Frontu nevyprázdní ani obnovení stránky nebo nové přihlášení.",
          "V patičce je verze aplikace a hash buildu — podle nich se pozná zařízení, které běží na staré verzi.",
          "Když je k dispozici nová verze, aplikace nabídne aktualizaci.",
        ],
      },
      {
        kind: "note",
        tone: "warn",
        body:
          "První přihlášení stanoviště i první otevření zpětné vazby vyžaduje připojení. Až poté je zařízení soběstačné.",
      },
    ],
  },
  {
    id: "adresy",
    title: "Přehled adres",
    blocks: [
      {
        kind: "table",
        head: ["Adresa", "Pro koho", "Přístup"],
        rows: [
          ["/", "Kdokoli", "Veřejná úvodní stránka"],
          ["/wiki", "Kdokoli", "Tato stránka"],
          ["/login", "Admin, organizátor", "Email a heslo"],
          ["/dashboard", "Organizátor", "Přihlášení"],
          ["/dashboard/results", "Účastníci, veřejnost", "Přístupový kód závodu"],
          ["/users", "Admin", "Přihlášení s právem admina"],
          ["/station", "Rozhodčí", "Ruční výběr závodu a stanoviště + PIN"],
          ["/station/<id>", "Rozhodčí", "QR kód na kartě stanoviště"],
          ["/feedback/<id>", "Doprovod hlídky", "QR kód na kartě hlídky"],
        ],
      },
    ],
  },
];

export default function WikiPage() {
  return (
    <div className="min-h-screen bg-scout-bg-app text-scout-text">
      <header className="sticky top-0 z-30 border-b border-scout-border bg-white/90 backdrop-blur">
        <div className="container flex h-13 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-15 font-bold tracking-tightest text-scout-blue">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-scout-yellow" />
            Scout Scoring
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" /> Úvod
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Přihlásit</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="bg-dashboard-hero text-white">
        <div className="container max-w-4xl py-12 sm:py-16">
          <p className="mb-4 text-12 uppercase tracking-0.6 text-white/55">Dokumentace</p>
          <h1 className="text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl">
            Jak Scout Scoring <span className="scout-underline pb-0.5">funguje</span>
          </h1>
          <p className="mt-5 max-w-2xl text-15 text-white/70">
            Popis všech funkcí aplikace podle toho, kdo je používá — administrátor, organizátor závodu,
            rozhodčí na stanovišti a doprovod hlídky.
          </p>
        </div>
      </section>

      <div className="container max-w-6xl py-8 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Osnova" className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-12 border border-scout-border bg-white p-4">
              <p className="mb-3 text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted">Osnova</p>
              <ol className="space-y-0.5">
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex gap-2 rounded-8 px-2 py-1.5 text-13 text-scout-text-secondary transition hover:bg-scout-bg-subtle hover:text-scout-blue"
                    >
                      <span className="tabular-nums text-scout-text-muted">{i + 1}.</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <main className="min-w-0 space-y-10">
            {SECTIONS.map((section, i) => (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <h2 className="flex items-baseline gap-3 text-22 font-bold tracking-tight text-scout-text">
                  <span className="text-16 font-bold tabular-nums text-scout-yellow">{i + 1}</span>
                  {section.title}
                </h2>
                {section.lead ? (
                  <p className="mt-2.5 max-w-3xl text-14 leading-relaxed text-scout-text-secondary">{section.lead}</p>
                ) : null}
                <div className="mt-5 space-y-4">
                  {section.blocks.map((block, bi) => (
                    <BlockView key={bi} block={block} />
                  ))}
                </div>
              </section>
            ))}

            <div className="rounded-12 border border-scout-border bg-white p-5">
              <p className="text-13 text-scout-text-secondary">
                Chybí ti tu něco, nebo se aplikace chová jinak, než je popsáno? Napiš to organizátorovi instance —
                stránka se drží aktuálního chování aplikace.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/login">
                  Otevřít dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </main>
        </div>
      </div>

      <footer className="border-t border-scout-border bg-white">
        <div className="container flex h-14 items-center justify-between text-12 text-scout-text-muted">
          <span>Scout Scoring — bodování skautských závodů bez papíru.</span>
          <Link href="/" className="transition hover:text-scout-blue">
            Úvodní stránka
          </Link>
        </div>
      </footer>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "text") {
    return <p className="max-w-3xl text-14 leading-relaxed text-scout-text-secondary">{inline(block.body)}</p>;
  }

  if (block.kind === "list") {
    return (
      <div className="rounded-12 border border-scout-border bg-white p-5">
        {block.title ? <h3 className="mb-3 text-13 font-semibold text-scout-text">{block.title}</h3> : null}
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-14 leading-relaxed text-scout-text-secondary">
              <span className="mt-2 h-1.25 w-1.25 shrink-0 rounded-full bg-scout-yellow" />
              <span>{inline(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (block.kind === "steps") {
    return (
      <div className="rounded-12 border border-scout-border bg-white p-5">
        {block.title ? <h3 className="mb-3 text-13 font-semibold text-scout-text">{block.title}</h3> : null}
        <ol className="space-y-4">
          {block.items.map((step, i) => (
            <li key={i} className="border-l-2 border-scout-border pl-4">
              <p className="text-13 font-semibold text-scout-blue">{step.name}</p>
              <p className="mt-1 text-14 leading-relaxed text-scout-text-secondary">{inline(step.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (block.kind === "table") {
    return (
      <div className="rounded-12 border border-scout-border bg-white p-5">
        {block.title ? <h3 className="mb-3 text-13 font-semibold text-scout-text">{block.title}</h3> : null}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-scout-bg-table">
                {block.head.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2.25 text-2xs font-semibold uppercase tracking-0.6 text-scout-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-scout-border">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={
                        ci === 0
                          ? "px-3 py-2.25 align-top text-13 font-semibold text-scout-text"
                          : "px-3 py-2.25 align-top text-13 text-scout-text-secondary"
                      }
                    >
                      {ci === 0 ? <span className="font-mono text-12">{cell}</span> : inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const warn = block.tone === "warn";
  return (
    <div
      className={
        warn
          ? "rounded-12 border border-scout-yellow-border bg-scout-yellow-soft p-4"
          : "rounded-12 border border-scout-border bg-scout-bg-subtle p-4"
      }
    >
      <p className={warn ? "text-14 leading-relaxed text-scout-text-warm" : "text-14 leading-relaxed text-scout-text-secondary"}>
        {inline(block.body)}
      </p>
    </div>
  );
}

/** Minimální inline formátování: **tučně** a `kód`. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-scout-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded-4 bg-scout-bg-table px-1 py-0.5 font-mono text-12 text-scout-text">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
