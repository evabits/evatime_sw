import { z } from "zod";

export const kmTemplateSchema = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  activityTypeId: z.string().optional().nullable(),
  km: z.number().positive(),
  description: z.string().optional().nullable(),
});
