import assert from "node:assert";
import { kmTemplateSchema } from "./km-template";

// valid payload parses, activityTypeId/description optional
assert.ok(kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: 45.5 }).success, "valid minimal");
assert.ok(
  kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", activityTypeId: null, km: 1, description: "x" }).success,
  "valid full"
);

// missing name rejected
assert.ok(!kmTemplateSchema.safeParse({ name: "", projectId: "p1", km: 1 }).success, "empty name rejected");
// non-positive km rejected
assert.ok(!kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: 0 }).success, "zero km rejected");
assert.ok(!kmTemplateSchema.safeParse({ name: "Thuis", projectId: "p1", km: -5 }).success, "negative km rejected");

console.log("km-template schema: all assertions passed");
