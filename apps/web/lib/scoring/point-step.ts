/**
 * Velikost skoku "velkého" tlačítka tak, aby počet kliknutí nezávisel na
 * zvoleném kroku bodování.
 *
 * Mřížka má `max / step` pozic. Nejhorší hodnota stojí zhruba `max / f`
 * kliknutí velkým tlačítkem plus `f / (2 * step)` doladění malým, což je
 * nejmenší pro f = odmocnina(2 * max * step). Samotný tento člen ale u
 * velkých maxim prohrává s dosavadním 0,4 * max: hodnotu u horního okraje
 * je rychlejší "nabrat" přes ořez na maximu a vrátit se dolů. Bereme proto
 * větší z obou — menší z nich by v daném režimu jen přidával kliknutí.
 *
 * Výsledek se zaokrouhlí na násobek 0,5 (u celých bodů na 1), aby na
 * tlačítku nebylo 2,25. Když by skok nebyl aspoň trojnásobek jemného
 * kroku, tlačítko se nevykreslí — proti malému tlačítku nic nepřináší.
 *
 * Zaokrouhlení může trefit číslo, které rozsah dělí hůř než dřívější
 * 0,4 * max; stojí to jedno kliknutí navíc a v maximech do 20 bodů se to
 * týká jediné kombinace (7 bodů po čtvrtbodech). Hlídá to test, který
 * vedle toho počítá i zisk na zbytku rozsahu.
 */
export function fastStepFor(max: number, step: number) {
  if (!(max > 0) || !(step > 0)) {
    return null;
  }

  const quantum = step < 1 ? 0.5 : 1;
  const ideal = Math.max(Math.sqrt(2 * max * step), 0.4 * max);
  const snapped = Math.round(ideal / quantum) * quantum;

  return snapped >= 3 * step ? snapped : null;
}
