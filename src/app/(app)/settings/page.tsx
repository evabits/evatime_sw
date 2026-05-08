import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/utils";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const settings = await prisma.companySettings.findFirst();
  return <SettingsClient initialSettings={serialize(settings)} />;
}
