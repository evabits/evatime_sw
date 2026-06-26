import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { REVIEW_TEMPLATE_SEED } from "@/lib/reviews";
import { TemplateEditorClient } from "@/components/reviews/template-editor-client";

export default async function ReviewTemplatePage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "ADMIN") redirect("/");
  const tpl = await prisma.reviewTemplate.findFirst();
  const definition = (tpl?.definition ?? REVIEW_TEMPLATE_SEED) as any;
  return <TemplateEditorClient initialDefinition={definition} />;
}
