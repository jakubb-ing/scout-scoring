export function getCategoryKind(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("hol") || normalized.includes("dív") || normalized === "d") {
    return "girls";
  }

  if (normalized.includes("klu") || normalized.includes("chlap") || normalized === "ch") {
    return "boys";
  }

  if (normalized.includes("nesout")) {
    return "open";
  }

  return "other";
}

export function CategoryBadge({ label }: { label: string }) {
  const kind = getCategoryKind(label);
  const tone = kind === "girls"
    ? "bg-pink-100 text-pink-800"
    : kind === "boys"
      ? "bg-sky-100 text-sky-800"
      : kind === "open"
        ? "bg-slate-100 text-slate-700"
        : "bg-scout-category-open text-scout-text-warm";

  return <span className={`inline-flex rounded-full px-2 py-0.75 text-11 font-semibold ${tone}`}>{label}</span>;
}
