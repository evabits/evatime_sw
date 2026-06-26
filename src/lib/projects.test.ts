import assert from "node:assert";
import { projectCreateDenialReason } from "./projects";

// Admins may create anything.
assert.strictEqual(projectCreateDenialReason("ADMIN", { status: "ACTIVE", customerId: "c1" }), null);
assert.strictEqual(projectCreateDenialReason("ADMIN", { status: "CONCEPT" }), null);

// Employees may create a bare concept project.
assert.strictEqual(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT" }), null);

// Employees may not create non-concept projects.
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "ACTIVE" }));

// Employees may not attach a customer or rates to a concept project.
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", customerId: "c1" }));
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultHourlyRate: 80 }));
assert.ok(projectCreateDenialReason("EMPLOYEE", { status: "CONCEPT", defaultKmRate: 0.23 }));

// FINANCE is not an admin -> same restriction as employees.
assert.ok(projectCreateDenialReason("FINANCE", { status: "ACTIVE", customerId: "c1" }));

console.log("projects.test.ts passed");
