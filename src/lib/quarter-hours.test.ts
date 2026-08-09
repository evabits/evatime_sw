import { describe, it, expect } from "vitest";
import { isQuarter, hoursBetween, toQuarter, normalizeTime, TIME_CHOICES, HOUR_CHOICES } from "./quarter-hours";

describe("isQuarter", () => {
  it("accepts whole hours", () => {
    expect(isQuarter(8)).toBe(true);
  });

  it("accepts every quarter within an hour", () => {
    expect(isQuarter(0.25)).toBe(true);
    expect(isQuarter(0.5)).toBe(true);
    expect(isQuarter(0.75)).toBe(true);
  });

  it("accepts a large value that is still a quarter", () => {
    expect(isQuarter(416.25)).toBe(true);
  });

  it("rejects a tenth of an hour", () => {
    expect(isQuarter(1.3)).toBe(false);
  });

  it("rejects the values an even split used to produce", () => {
    // 10 uur over 3 dagen leverde vroeger 3.33 en 3.34 op.
    expect(isQuarter(3.33)).toBe(false);
    expect(isQuarter(3.34)).toBe(false);
  });

  it("accepts zero, so a pattern day of nought is not a validation error", () => {
    expect(isQuarter(0)).toBe(true);
  });

  it("rejects values that are not finite", () => {
    expect(isQuarter(NaN)).toBe(false);
    expect(isQuarter(Infinity)).toBe(false);
  });

  it("does not trip over floating-point noise", () => {
    // 0.1 + 0.2 is 0.30000000000000004 en hoort gewoon geweigerd te worden,
    // maar een som van kwartieren die net naast de waarde landt niet.
    expect(isQuarter(0.1 + 0.2)).toBe(false);
    expect(isQuarter(2.75 + 2.75 + 2.5)).toBe(true);
  });
});

describe("toQuarter", () => {
  it("laat een waarde die al een kwartier is met rust", () => {
    expect(toQuarter(7.75)).toBe(7.75);
    expect(toQuarter(8)).toBe(8);
    expect(toQuarter(0.25)).toBe(0.25);
  });

  it("rondt naar boven wanneer dat het dichtstbij is", () => {
    // Negen tot zeven over vijf min twintig minuten pauze: 7,67 uur.
    expect(toQuarter(7.67)).toBe(7.75);
  });

  it("rondt naar beneden wanneer dát het dichtstbij is", () => {
    expect(toQuarter(7.6)).toBe(7.5);
  });

  it("rondt precies op de helft naar boven", () => {
    expect(toQuarter(7.625)).toBe(7.75);
  });

  it("laat nul nul", () => {
    expect(toQuarter(0)).toBe(0);
  });

  it("rondt een te kleine waarde naar nul, zodat de aanroeper hem weigert", () => {
    // Geen minimum van een kwartier: er een kwartier van maken zou tijd
    // verzinnen die niet gewerkt is. De eis "moet positief zijn" vangt dit.
    expect(toQuarter(0.1)).toBe(0);
  });

  it("levert altijd zelf een kwartier op", () => {
    // De twee regels mogen niet uiteenlopen: wat hieruit komt moet door
    // isQuarter heen, anders zou het scherm alsnog een weigering krijgen na
    // zijn eigen afronding.
    for (const uren of [0, 0.1, 1.01, 2.49, 3.13, 7.6, 7.67, 7.625, 12.99, 23.99]) {
      expect(isQuarter(toQuarter(uren))).toBe(true);
    }
  });
});

describe("normalizeTime", () => {
  it("vult een eencijferig uur aan", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
  });

  it("vult een eencijferige minuut aan", () => {
    expect(normalizeTime("09:5")).toBe("09:05");
  });

  it("vult beide aan", () => {
    expect(normalizeTime("9:5")).toBe("09:05");
  });

  it("laat een waarde die al goed staat met rust", () => {
    expect(normalizeTime("09:00")).toBe("09:00");
    expect(normalizeTime("23:45")).toBe("23:45");
  });

  it("laat leeg leeg", () => {
    expect(normalizeTime("")).toBe("");
  });

  it("geeft iets wat er niet op lijkt onveranderd terug", () => {
    // Dan doet de bestaande melding zijn werk in plaats van dat hier stilletjes
    // iets anders van gemaakt wordt.
    expect(normalizeTime("930")).toBe("930");
    expect(normalizeTime("9u30")).toBe("9u30");
    expect(normalizeTime("kwart over negen")).toBe("kwart over negen");
  });

  it("oordeelt niet over het bereik", () => {
    // hoursBetween is de enige plek die dat doet.
    expect(normalizeTime("25:00")).toBe("25:00");
    expect(hoursBetween(normalizeTime("25:00"), "26:00")).toBe(null);
  });
});

describe("TIME_CHOICES", () => {
  it("dekt het hele etmaal in kwartieren", () => {
    expect(TIME_CHOICES.length).toBe(96);
    expect(TIME_CHOICES[0]).toBe("00:00");
    expect(TIME_CHOICES[TIME_CHOICES.length - 1]).toBe("23:45");
  });

  it("biedt uitsluitend tijdstippen die op een kwartier vallen", () => {
    // Anders zou de keuzelijst een waarde aanbieden die het formulier daarna
    // afrondt naar iets anders dan je aanklikte.
    for (const tijd of TIME_CHOICES.slice(1)) {
      expect(isQuarter(hoursBetween("00:00", tijd)!)).toBe(true);
    }
  });
});

describe("HOUR_CHOICES", () => {
  it("loopt van een kwartier tot twaalf uur", () => {
    expect(HOUR_CHOICES.length).toBe(48);
    expect(HOUR_CHOICES[0]).toBe(0.25);
    expect(HOUR_CHOICES[HOUR_CHOICES.length - 1]).toBe(12);
  });

  it("biedt uitsluitend kwartieren aan", () => {
    for (const uren of HOUR_CHOICES) {
      expect(isQuarter(uren)).toBe(true);
      expect(toQuarter(uren)).toBe(uren);
    }
  });
});

describe("hoursBetween", () => {
  it("counts a quarter of an hour", () => {
    expect(hoursBetween("09:00", "09:15")).toBe(0.25);
  });

  it("counts a morning", () => {
    expect(hoursBetween("09:00", "12:15")).toBe(3.25);
  });

  it("counts a whole working day", () => {
    expect(hoursBetween("09:00", "17:00")).toBe(8);
  });

  it("refuses an end time before the start", () => {
    expect(hoursBetween("17:00", "09:00")).toBe(null);
  });

  it("refuses an end time equal to the start", () => {
    expect(hoursBetween("09:00", "09:00")).toBe(null);
  });

  it("refuses a missing or malformed time", () => {
    expect(hoursBetween("", "17:00")).toBe(null);
    expect(hoursBetween("09:00", "")).toBe(null);
    expect(hoursBetween("9:00", "17:00")).toBe(null);
    expect(hoursBetween("25:00", "26:00")).toBe(null);
    expect(hoursBetween("09:60", "10:00")).toBe(null);
  });

  it("rounds to two decimals so the value fits the hours column", () => {
    // Tien over negen tot twaalf uur is 170 minuten: 2.8333... uur. Dat is geen
    // kwartier en wordt verderop geweigerd, maar het veld moet er niet
    // 2.8333333333333335 in zetten.
    expect(hoursBetween("09:10", "12:00")).toBe(2.83);
  });
});

describe("hoursBetween met pauze", () => {
  it("trekt de pauze van het tijdvak af", () => {
    // Het geval waarvoor dit gebouwd is: negen tot vijf met een half uur pauze.
    expect(hoursBetween("09:00", "17:00", 30)).toBe(7.5);
  });

  it("rekent zonder pauze hetzelfde als voorheen", () => {
    expect(hoursBetween("09:00", "17:00", 0)).toBe(8);
    expect(hoursBetween("09:00", "17:00")).toBe(hoursBetween("09:00", "17:00", 0));
  });

  it("weigert een pauze die het tijdvak precies opeet", () => {
    // Nul uur boeken heeft geen betekenis, dus dit is een typefout en geen
    // lege dag.
    expect(hoursBetween("09:00", "09:30", 30)).toBe(null);
  });

  it("weigert een pauze die langer is dan het tijdvak", () => {
    expect(hoursBetween("09:00", "09:30", 60)).toBe(null);
  });

  it("weigert een negatieve pauze, want die zou uren bijtellen", () => {
    expect(hoursBetween("09:00", "17:00", -30)).toBe(null);
  });

  it("weigert een pauze die geen getal is", () => {
    // Een leeg of onleesbaar invoerveld levert NaN op via Number().
    expect(hoursBetween("09:00", "17:00", NaN)).toBe(null);
    expect(hoursBetween("09:00", "17:00", Infinity)).toBe(null);
  });

  it("laat een pauze die geen kwartier is gewoon doorrekenen", () => {
    // Deze functie oordeelt niet over de stap, net zomin als over het tijdvak.
    // De aanroeper haalt het resultaat door toQuarter, dus 20 minuten pauze
    // levert uiteindelijk 7,75 op zonder dat de gebruiker iets hoeft te doen.
    const uren = hoursBetween("09:00", "17:00", 20);
    expect(uren).toBe(7.67);
    expect(isQuarter(uren!)).toBe(false);
    expect(toQuarter(uren!)).toBe(7.75);
  });
});
