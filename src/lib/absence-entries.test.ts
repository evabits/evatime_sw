import { describe, it, expect } from "vitest";
import { ABSENCE_PROJECT_NAMES, splitHoursOverDays } from "./absence-entries";
import { isQuarter } from "./quarter-hours";

/** Optellen in centen: 3.33 + 3.33 + 3.34 is in floating point net geen 10. */
function totaalInCenten(regels: Array<{ hours: number }>): number {
  return regels.reduce((som, r) => som + Math.round(r.hours * 100), 0);
}

describe("ABSENCE_PROJECT_NAMES", () => {
  it("names a project for every absence type", () => {
    expect(ABSENCE_PROJECT_NAMES).toEqual({
      VACATION: "Vakantieverlof",
      SICK: "Ziekteverlof",
      PARENTAL_LEAVE: "Ouderschapsverlof",
      SPECIAL_LEAVE: "Bijzonder verlof",
      UNPAID_LEAVE: "Onbetaald verlof",
    });
  });
});

describe("splitHoursOverDays", () => {
  const week = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

  it("divides evenly when it comes out round", () => {
    expect(splitHoursOverDays(40, week)).toEqual([
      { date: "2026-08-03", hours: 8 },
      { date: "2026-08-04", hours: 8 },
      { date: "2026-08-05", hours: 8 },
      { date: "2026-08-06", hours: 8 },
      { date: "2026-08-07", hours: 8 },
    ]);
  });

  it("spreads the leftover quarters over the first days", () => {
    // 10 uur is 40 kwartieren; 40 / 3 is 13 kwartieren met 1 over, en die gaat
    // naar de eerste dag. Niet naar de laatste: dan zou de laatste dag van een
    // lange periode structureel de vreemde eend zijn.
    expect(splitHoursOverDays(10, ["2026-08-03", "2026-08-04", "2026-08-05"])).toEqual([
      { date: "2026-08-03", hours: 3.5 },
      { date: "2026-08-04", hours: 3.25 },
      { date: "2026-08-05", hours: 3.25 },
    ]);
  });

  it("handles a single day", () => {
    expect(splitHoursOverDays(8, ["2026-08-04"])).toEqual([{ date: "2026-08-04", hours: 8 }]);
  });

  it("returns nothing for no days rather than dividing by zero", () => {
    expect(splitHoursOverDays(8, [])).toEqual([]);
  });

  it("splits a half day across two days", () => {
    expect(splitHoursOverDays(7.5, ["2026-08-03", "2026-08-04"])).toEqual([
      { date: "2026-08-03", hours: 3.75 },
      { date: "2026-08-04", hours: 3.75 },
    ]);
  });

  it("always sums to exactly the requested total", () => {
    // The property that matters: an approval must never quietly book more or
    // fewer hours than the employee asked for.
    //
    // De lijst bevat alleen kwartiertotalen, want dat is wat de invoercontrole
    // voortaan doorlaat. 36,4 en 13,33 stonden hier vroeger ook in; die kunnen
    // per definitie niet in kwartieren opgaan.
    for (const totaal of [40, 10, 7.5, 1, 36.25, 13.75, 0.25]) {
      expect(totaalInCenten(splitHoursOverDays(totaal, week))).toBe(Math.round(totaal * 100));
    }
  });

  it("only ever produces quarters", () => {
    for (const totaal of [40, 10, 7.5, 1, 36.25, 13.75]) {
      for (const regel of splitHoursOverDays(totaal, week)) {
        expect(isQuarter(regel.hours)).toBe(true);
      }
    }
  });

  it("skips days that do not get a quarter instead of booking nought hours", () => {
    // Eén uur over vijf dagen is vier kwartieren. De vijfde dag krijgt niets en
    // hoort dan geen urenregel op te leveren.
    expect(splitHoursOverDays(1, week)).toEqual([
      { date: "2026-08-03", hours: 0.25 },
      { date: "2026-08-04", hours: 0.25 },
      { date: "2026-08-05", hours: 0.25 },
      { date: "2026-08-06", hours: 0.25 },
    ]);
  });

  it("rounds a legacy total that is not a quarter to the nearest one", () => {
    // Kan alleen bij aanvragen die al in productie stonden voordat de
    // kwartierregel ging gelden. 3,30 wordt 13 kwartieren, dus 3,25.
    expect(totaalInCenten(splitHoursOverDays(3.3, ["2026-08-03"]))).toBe(325);
  });

  it("returns nothing for a legacy total below half a quarter", () => {
    // Ook alleen bereikbaar via een oud, niet-kwartier totaal: 0,1 rondt af
    // naar 0 kwartieren. De goedkeuringsroute weigert zo'n aanvraag inmiddels
    // aan de poort; dit pint alleen dat de functie hier niets verzint.
    expect(splitHoursOverDays(0.1, week)).toEqual([]);
  });
});

import { patternedEntries, patternSummary } from "./absence-entries";

// Weekdagen, nagerekend tegen de kalender: 2026-08-03 en 2026-08-10 zijn
// maandagen, 2026-08-05 en 2026-08-12 woensdagen, 2026-08-07 en 2026-08-14
// vrijdagen, 2026-08-08 een zaterdag.
const WOENSDAG = { monday: 0, tuesday: 0, wednesday: 8, thursday: 0, friday: 0 };
const MA_WO = { monday: 4, tuesday: 0, wednesday: 4, thursday: 0, friday: 0 };
const NIETS = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0 };
const WERKWEEK = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"];

describe("patternedEntries", () => {
  it("keeps only the day the pattern names", () => {
    expect(patternedEntries(WOENSDAG, WERKWEEK)).toEqual([
      { date: "2026-08-05", hours: 8 },
    ]);
  });

  it("keeps every day the pattern names", () => {
    expect(patternedEntries(MA_WO, WERKWEEK)).toEqual([
      { date: "2026-08-03", hours: 4 },
      { date: "2026-08-05", hours: 4 },
    ]);
  });

  it("repeats across weeks", () => {
    const tweeWeken = [...WERKWEEK, "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
    expect(patternedEntries(WOENSDAG, tweeWeken)).toEqual([
      { date: "2026-08-05", hours: 8 },
      { date: "2026-08-12", hours: 8 },
    ]);
  });

  it("drops a Saturday even when the pattern is not empty", () => {
    // Het patroon kent geen weekendvelden, dus scheduledHoursOn geeft daar 0.
    expect(patternedEntries(WOENSDAG, ["2026-08-08"])).toEqual([]);
  });

  it("returns nothing for an all-zero pattern", () => {
    expect(patternedEntries(NIETS, WERKWEEK)).toEqual([]);
  });

  it("returns nothing for an empty list of days", () => {
    expect(patternedEntries(WOENSDAG, [])).toEqual([]);
  });
});

describe("patternSummary", () => {
  it("counts one working week", () => {
    const { entries, total } = patternSummary(WOENSDAG, "2026-08-03", "2026-08-07");
    expect(entries).toEqual([{ date: "2026-08-05", hours: 8 }]);
    expect(total).toBe(8);
  });

  it("adds up the hours of every matching day", () => {
    const { entries, total } = patternSummary(MA_WO, "2026-08-03", "2026-08-14");
    expect(entries).toHaveLength(4);
    expect(total).toBe(16);
  });

  it("counts a full year of Wednesdays", () => {
    // De aanvraag uit de aanleiding. 11 januari 2026 is een zondag, dus de
    // eerste woensdag is de 14e. Nagerekend tegen de kalender: 52 dagen.
    const { entries, total } = patternSummary(WOENSDAG, "2026-01-11", "2027-01-10");
    expect(entries).toHaveLength(52);
    expect(total).toBe(416);
  });

  it("returns nothing when the period contains no matching day", () => {
    // Maandag tot en met dinsdag bevat geen woensdag.
    const { entries, total } = patternSummary(WOENSDAG, "2026-08-03", "2026-08-04");
    expect(entries).toEqual([]);
    expect(total).toBe(0);
  });

  it("does not leak floating-point noise into the total", () => {
    // 6.1 + 6.1 + 6.1 is 18.299999999999997 zonder afronding.
    //
    // Waarom juist deze waarde: kwartieren drijven nooit af, want 0.25 is
    // 2^-2 en dus exact in binair. Met de step="0.25" van het formulier is
    // deze afronding onbereikbaar — maar de route accepteert elk getal tussen
    // 0 en 24, en dáár komt hij vandaan. Een fixture van hele of kwartieruren
    // zou even hard slagen zonder de afronding en dus niets bewijzen.
    const zesEen = { monday: 0, tuesday: 0, wednesday: 6.1, thursday: 0, friday: 0 };
    // 2026-08-05, 2026-08-12 en 2026-08-19 zijn woensdagen.
    const { entries, total } = patternSummary(zesEen, "2026-08-03", "2026-08-21");
    expect(entries).toHaveLength(3);
    expect(total).toBe(18.3);
  });
});

import { absenceLines } from "./absence-entries";

describe("absenceLines", () => {
  const patroon = { monday: 0, tuesday: 0, wednesday: 8, thursday: 0, friday: 0 };

  it("splits an unpatterned request evenly over the working days", () => {
    // 2026-08-03 is een maandag, 2026-08-07 een vrijdag.
    const uitkomst = absenceLines(40, null, "2026-08-03", "2026-08-07");
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-03", hours: 8 },
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("keeps only the days the pattern names, and ignores the hours it was given", () => {
    // Het totaal van 999 wordt genegeerd: met een patroon bepalen de
    // dagwaarden de uren, niet het opgegeven totaal.
    const uitkomst = absenceLines(999, patroon, "2026-08-03", "2026-08-14");
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-12", hours: 8 },
      ],
    });
  });

  it("refuses a period without working days", () => {
    // 2026-08-08 is een zaterdag, 2026-08-09 een zondag.
    expect(absenceLines(8, null, "2026-08-08", "2026-08-09")).toEqual({
      ok: false,
      error: "Deze periode bevat geen werkdagen",
    });
  });

  it("reports no working days before checking the pattern, even with a pattern set", () => {
    // Pint de volgorde van de twee weigeringen: een weekend-only periode moet
    // "geen werkdagen" melden, niet de patroonmelding, ook al is er een patroon.
    // 2026-08-08 is een zaterdag, 2026-08-09 een zondag.
    expect(absenceLines(8, patroon, "2026-08-08", "2026-08-09"))
      .toEqual({ ok: false, error: "Deze periode bevat geen werkdagen" });
  });

  it("refuses a period in which no day matches the pattern", () => {
    // Maandag en dinsdag, met een woensdagpatroon.
    expect(absenceLines(8, patroon, "2026-08-03", "2026-08-04")).toEqual({
      ok: false,
      error: "Deze periode bevat geen dagen die op het patroon passen",
    });
  });

  it("produces lines that sum to the requested total without a pattern", () => {
    const uitkomst = absenceLines(10, null, "2026-08-03", "2026-08-05");
    if (!uitkomst.ok) throw new Error("verwachtte regels");
    const som = uitkomst.entries.reduce((s, e) => s + Math.round(e.hours * 100), 0);
    expect(som).toBe(1000);
  });

  // Merlijn Kunst werkt maandags niet.
  const roosterZonderMaandag = { monday: 0, tuesday: 8, wednesday: 8, thursday: 8, friday: 8 };
  // Paul van Gelderen werkt maandag, woensdag en vrijdag.
  const roosterOmDeDag = { monday: 8, tuesday: 0, wednesday: 8, thursday: 0, friday: 8 };

  it("skips the day the schedule leaves free", () => {
    const uitkomst = absenceLines(32, null, "2026-08-03", "2026-08-07", roosterZonderMaandag);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("keeps only the three days a part-time schedule works", () => {
    const uitkomst = absenceLines(24, null, "2026-08-03", "2026-08-07", roosterOmDeDag);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-03", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("leaves a half day on the scheduled day it was asked for", () => {
    const uitkomst = absenceLines(4, null, "2026-08-04", "2026-08-04", roosterZonderMaandag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-04", hours: 4 }] });
  });

  it("changes nothing without a schedule", () => {
    // Expliciete null als rooster: elke werkdag is dan gewoon een werkdag,
    // net als vóór dit argument bestond. Dit pint het concrete resultaat in
    // plaats van alleen het defaultgedrag van het vijfde argument te testen —
    // dat laatste zou ook slagen als de hele roosterfunctionaliteit verdween.
    expect(absenceLines(40, null, "2026-08-03", "2026-08-07", null)).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-03", hours: 8 },
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("falls back to every working day when the schedule leaves none", () => {
    // Verlof op precies een vaste vrije dag. Het scherm stelt hier nul uur voor
    // en houdt dat tegen; wie tóch uren opgeeft bedoelt die dag, dus de uren
    // horen daar te landen in plaats van te verdwijnen.
    const uitkomst = absenceLines(8, null, "2026-08-03", "2026-08-03", roosterZonderMaandag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-03", hours: 8 }] });
  });

  // Rooster met een korte vrijdag: 0, 8, 8, 8, 4 uur.
  const roosterOngelijk = { monday: 0, tuesday: 8, wednesday: 8, thursday: 8, friday: 4 };

  it("takes the hours straight from an uneven schedule when the total matches", () => {
    // 28 is het roostertotaal van roosterOngelijk over deze week — precies wat
    // patternSummary het dialoog zou voorstellen. Plat verdelen zou 7,00 uur
    // per dag geven; hier hoort de vrijdag zijn eigen vier uur te houden.
    const uitkomst = absenceLines(28, null, "2026-08-03", "2026-08-07", roosterOngelijk);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 4 },
      ],
    });
  });

  it("falls back to a flat split over an uneven schedule when the total was overridden", () => {
    // 14 is niet het roostertotaal (28): de aanvrager heeft het voorgestelde
    // getal aangepast, dus geldt weer de platte verdeling over dezelfde vier
    // werkdagen — 14 uur (56 kwartier) door vier is keurig 3,5 per dag.
    const uitkomst = absenceLines(14, null, "2026-08-03", "2026-08-07", roosterOngelijk);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-04", hours: 3.5 },
        { date: "2026-08-05", hours: 3.5 },
        { date: "2026-08-06", hours: 3.5 },
        { date: "2026-08-07", hours: 3.5 },
      ],
    });
  });

  it("keeps splitting a matching total flat when the schedule is even", () => {
    // Pint dat een gelijk rooster (vier keer 8) niet van gedrag verandert: de
    // uitkomst is hier identiek aan wat de platte verdeling ook al gaf.
    const uitkomst = absenceLines(32, null, "2026-08-03", "2026-08-07", roosterZonderMaandag);
    expect(uitkomst).toEqual({
      ok: true,
      entries: [
        { date: "2026-08-04", hours: 8 },
        { date: "2026-08-05", hours: 8 },
        { date: "2026-08-06", hours: 8 },
        { date: "2026-08-07", hours: 8 },
      ],
    });
  });

  it("lets the pattern win over the schedule", () => {
    // Woensdagpatroon over een week, met een rooster dat woensdag juist vrij
    // geeft: het patroon is een uitdrukkelijke keuze en gaat voor.
    const roosterZonderWoensdag = { monday: 8, tuesday: 8, wednesday: 0, thursday: 8, friday: 8 };
    const uitkomst = absenceLines(999, patroon, "2026-08-03", "2026-08-07", roosterZonderWoensdag);
    expect(uitkomst).toEqual({ ok: true, entries: [{ date: "2026-08-05", hours: 8 }] });
  });
});
