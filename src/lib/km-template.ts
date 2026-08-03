import { z } from "zod";

export const kmTemplateSchema = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  km: z.number().positive(),
  description: z.string().optional().nullable(),
});

export function canManageTemplate(opts: {
  role: string;
  currentUserId: string;
  ownerId: string;
  managedByAdmin: boolean;
}): boolean {
  const admin = opts.role === "ADMIN";
  if (opts.managedByAdmin) return admin; // managed rows: admin only
  return admin || opts.ownerId === opts.currentUserId; // self rows: owner or admin
}
