"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  data: { name: string; customer: string; hours: number; km: number }[];
}

export function DashboardChart({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uren per project</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Geen data beschikbaar</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              {/* Recharts tekent met inline SVG-attributen en kent geen
                  Tailwind-klassen, dus de tokens gaan hier met de hand mee.
                  Ze zijn niet hardgecodeerd maar verwijzen naar dezelfde
                  variabelen als de rest van de app, zodat de grafiek meekantelt. */}
              <XAxis dataKey="name" stroke="hsl(var(--border))" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis stroke="hsl(var(--border))" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(2)} uur`, "Uren"]}
                labelFormatter={(label) => `Project: ${label}`}
                cursor={{ fill: "hsl(var(--muted))", stroke: "hsl(var(--border))" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  color: "hsl(var(--popover-foreground))",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              />
              <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
