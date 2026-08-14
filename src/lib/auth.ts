import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  startImpersonation,
  stopImpersonation,
  impersonationInfo,
  type SessieToken,
} from "@/lib/impersonation";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google,
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !user.password) return null;

        const valid = await compare(parsed.data.password, user.password);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Restrict self-provisioning via Google to the company domain.
      // Credentials users already exist in the DB and passed authorize().
      if (account?.provider === "google" && !(user.email?.endsWith("@evabits.com") ?? false)) {
        return false;
      }
      // Block archived users from signing in (both providers). A brand-new
      // Google user has no row yet -> allowed, then created by the jwt upsert.
      if (user.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { archivedAt: true },
        });
        if (dbUser?.archivedAt) return false;
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        if (account?.provider === "google") {
          const dbUser = await prisma.user.upsert({
            where: { email: user.email! },
            update: {},
            create: {
              email: user.email!,
              name: user.name ?? user.email!,
              role: "EMPLOYEE",
              password: null,
            },
          });
          token.id = dbUser.id;
          token.role = dbUser.role;
        } else {
          token.id = user.id;
          token.role = (user as any).role;
        }
      }

      // Meekijken aan- of uitzetten. De rolcontrole hoort hier: het token is
      // servergetekend, dus dit is de enige plek waar niet te sjoemelen valt.
      if (trigger === "update") {
        const wens = session as { impersonate?: string | null } | undefined;

        if (wens?.impersonate === null) {
          return stopImpersonation(token as unknown as SessieToken) as any;
        }

        if (typeof wens?.impersonate === "string") {
          const doel = await prisma.user.findFirst({
            where: { id: wens.impersonate, archivedAt: null },
            select: { id: true, role: true, name: true, email: true },
          });
          if (!doel) return token;
          const nieuw = startImpersonation(token as unknown as SessieToken, doel);
          return (nieuw ?? token) as any;
        }
      }

      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as any).role = token.role;
      // De balk moet weten dát je meekijkt en als wie je werkelijk bent. De
      // vorm van dit veld staat vast in impersonation.ts, niet hier — anders
      // kan een hernoeming daar dit stukje stilletjes laten desynchroniseren.
      (session as any).impersonating = impersonationInfo(token as unknown as SessieToken);
      return session;
    },
  },
});
