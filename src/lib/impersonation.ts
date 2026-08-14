/**
 * Meekijken als medewerker: een beheerder ziet de app met de identiteit van
 * iemand anders, maar mag niets wijzigen.
 *
 * De identiteit zit in het JWT. `id`, `role`, `name` en `email` zijn de
 * medewerker die bekeken wordt — daar leest de rest van de app uit, en juist
 * daardoor is wat je ziet echt wat zij ziet. De vier `real*`-velden houden
 * vast wie je werkelijk bent; dát ze er staan is het teken dat je meekijkt.
 */
export type SessieToken = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  realId?: string;
  realRole?: string;
  realName?: string;
  realEmail?: string;
};

export type Medewerker = { id: string; role: string; name: string; email: string };

/** De route die het meekijken aan- en uitzet. */
export const IMPERSONATION_PAD = "/api/impersonate";

/**
 * Mag deze aanvraag schrijven?
 *
 * Meekijken is alleen-lezen, dus alles wat geen GET is gaat eruit — ook een
 * POST naar een pagina, want zo komt een server action binnen. De route die
 * het meekijken omzet is uitgezonderd; zonder die uitzondering kun je er niet
 * meer uit.
 */
export function mayWrite(method: string, pathname: string, meekijkend: boolean): boolean {
  if (!meekijkend) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  return pathname === IMPERSONATION_PAD || pathname.startsWith(`${IMPERSONATION_PAD}/`);
}

/**
 * Het token na het starten van het meekijken, of null als het niet mag.
 *
 * Alleen de échte rol telt. Wie meekijkt met een beheerder heeft ADMIN in
 * `role` staan; zou dat volstaan, dan kon een medewerker zich daarmee omhoog
 * werken. En wie al meekijkt en overstapt naar een andere medewerker houdt de
 * oorspronkelijke `real*`-velden: je wordt nooit "de beheerder die je aan het
 * bekijken was".
 */
export function startImpersonation(token: SessieToken, doel: Medewerker): SessieToken | null {
  const echteRol = token.realRole ?? token.role;
  if (echteRol !== "ADMIN") return null;

  return {
    ...token,
    id: doel.id,
    role: doel.role,
    name: doel.name,
    email: doel.email,
    realId: token.realId ?? token.id,
    realRole: echteRol,
    realName: token.realName ?? token.name ?? "",
    realEmail: token.realEmail ?? token.email ?? "",
  };
}

/**
 * Het token na het stoppen. De `real*`-velden verdwijnen: hun aanwezigheid is
 * het teken dat je meekijkt, dus ze laten staan zou de balk laten hangen.
 */
export function stopImpersonation(token: SessieToken): SessieToken {
  if (!token.realId) return token;
  const { realId, realRole, realName, realEmail, ...rest } = token;
  return {
    ...rest,
    id: realId,
    role: realRole ?? token.role,
    name: realName ?? token.name,
    email: realEmail ?? token.email,
  };
}

/**
 * De balkgegevens die de session-callback in `session.impersonating` zet:
 * null als je niet meekijkt, anders de naam van wie je werkelijk bent.
 *
 * Dit is puur token -> waarde, geen sessie-toegang, dus geen cast nodig.
 * `src/lib/auth.ts` gebruikt dit in plaats van het rechtstreeks inline te
 * bouwen, zodat de vorm van `impersonating` op één plek vastligt.
 */
export function impersonationInfo(token: SessieToken): { realName: string } | null {
  return token.realId ? { realName: token.realName ?? "" } : null;
}

/**
 * De balkgegevens uit een sessie-object, voor de layout die de balk rendert.
 * Null als er geen sessie is of niet wordt meegekeken.
 *
 * next-auth's `Session`-type breidt deze app bewust niet uit (zie AGENTS.md),
 * dus `session.impersonating` bestaat alleen op de waarde die de
 * session-callback er hierboven op zet — niet in de types. Dit is de enige
 * plek die de sessie daarom ongetypeerd aanspreekt op het veld
 * `impersonating`; alle drie de aanroepers hieronder gaan hierdoorheen zodat
 * die veldnaam nergens anders hoeft te staan.
 */
export function impersonationFromSession(session: unknown): { realName: string } | null {
  return (
    (session as { impersonating?: { realName: string } | null } | null | undefined)
      ?.impersonating ?? null
  );
}

/**
 * Kijkt deze sessie mee? Voor `src/proxy.ts` en
 * `src/app/api/impersonate/route.ts`, die alleen het ja/nee nodig hebben.
 */
export function isImpersonating(session: unknown): boolean {
  return impersonationFromSession(session) !== null;
}
