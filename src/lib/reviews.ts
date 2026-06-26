export type Respondent = "SELF" | "MANAGER";
export interface ReviewQuestion { key: string; label: string; hint?: string; respondent: Respondent; }
export interface ReviewSection { title: string; questions: ReviewQuestion[]; }
export interface ReviewDefinition { sections: ReviewSection[]; }

export function currentQuarter(date: Date = new Date()): string {
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${q}`;
}

export function questionKeys(def: ReviewDefinition, respondent: Respondent): string[] {
  return def.sections.flatMap((s) => s.questions).filter((q) => q.respondent === respondent).map((q) => q.key);
}

export function sanitizeAnswers(
  def: ReviewDefinition, respondent: Respondent, answers: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const allowed = new Set(questionKeys(def, respondent));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (allowed.has(k) && typeof v === "string") out[k] = v;
  }
  return out;
}

export const REVIEW_TEMPLATE_SEED: ReviewDefinition = {
  sections: [
    { title: "Zelfbeoordeling medewerker", questions: [
      { key: "satisfied", label: "Waar ben je tevreden over?", hint: "Behaalde resultaten, afgeronde opdrachten, opgeloste problemen of positieve samenwerking.", respondent: "SELF" },
      { key: "learned", label: "Wat ging minder goed en wat heb je daarvan geleerd?", hint: "Werk niet op tijd af, eerder hulp kunnen vragen, andere aanpak kunnen kiezen.", respondent: "SELF" },
      { key: "techDevelopment", label: "Hoe heb je jezelf technisch ontwikkeld?", hint: "Nieuwe kennis, vaardigheden, werkzaamheden of verantwoordelijkheden.", respondent: "SELF" },
      { key: "personalDevelopment", label: "Hoe heb je jezelf persoonlijk ontwikkeld?", hint: "Initiatief, communiceren, samenwerken, feedback ontvangen, verantwoordelijkheid nemen.", respondent: "SELF" },
      { key: "atmosphere", label: "Wat vind je van de werksfeer?", hint: "Plezier in je werk, gezelligheid, sociale veiligheid en activiteiten naast het werk.", respondent: "SELF" },
      { key: "futureDevelopment", label: "Waar wil je je de komende periode verder in ontwikkelen?", respondent: "SELF" },
    ] },
    { title: "Technisch functioneren", questions: [
      { key: "quality", label: "Kwaliteit van het werk", hint: "Controleert eigen werk; fouten tijdig herkend/opgelost; resultaat volledig en bruikbaar; leert van fouten.", respondent: "MANAGER" },
      { key: "execution", label: "Uitvoering en afronding van opdrachten", hint: "Opdrachten zelfstandig opgepakt; voortgang bewaakt; werk afgerond; problemen tijdig gemeld.", respondent: "MANAGER" },
      { key: "knowledge", label: "Technische kennis en probleemoplossing", hint: "Onderzoekt eerst zelf; verzamelt informatie logisch; passende oplossingen; tijdig hulp inschakelen.", respondent: "MANAGER" },
      { key: "techGrowth", label: "Technische ontwikkeling", hint: "Open voor nieuwe werkzaamheden; doet nieuwe kennis op; past feedback toe; deelt kennis.", respondent: "MANAGER" },
    ] },
    { title: "Persoonlijk functioneren", questions: [
      { key: "responsibility", label: "Verantwoordelijkheid en initiatief", hint: "Komt afspraken na; onderneemt actie; benoemt en pakt problemen op; denkt vooruit.", respondent: "MANAGER" },
      { key: "askingHelp", label: "Hulp vragen en omgaan met knelpunten", hint: "Geeft tijdig aan; vraagt gericht om hulp; legt uit wat geprobeerd is; voorkomt stilstand.", respondent: "MANAGER" },
      { key: "communication", label: "Communicatie en samenwerking", hint: "Communiceert duidelijk; informeert collega's tijdig; denkt mee; deelt informatie.", respondent: "MANAGER" },
      { key: "feedbackHandling", label: "Feedback en persoonlijke ontwikkeling", hint: "Open voor feedback; past het toe; reflecteert; neemt verantwoordelijkheid voor ontwikkeling.", respondent: "MANAGER" },
    ] },
    { title: "Samenvatting", questions: [
      { key: "strengths", label: "Sterke punten", hint: "Wat laat de medewerker consequent goed zien?", respondent: "MANAGER" },
      { key: "developmentPoints", label: "Ontwikkelpunten", hint: "Welk gedrag, kennis of werkwijze vraagt verdere ontwikkeling?", respondent: "MANAGER" },
      { key: "conclusion", label: "Algemene conclusie", hint: "Korte beschrijving van het functioneren over de gehele periode.", respondent: "MANAGER" },
    ] },
  ],
};
