"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Media sobre 100 por equipo, con la dispersión entre jueces como barra de error.
export function ResultsChart({
  data,
}: {
  data: { name: string; media: number; dispersion: number }[];
}) {
  if (!data.length) return null;

  return (
    <div className="h-72 w-full print:hidden" role="img" aria-label="Media por equipo">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 48, left: 0 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            angle={-35}
            dataKey="name"
            fontSize={11}
            interval={0}
            stroke="currentColor"
            textAnchor="end"
          />
          <YAxis domain={[0, 100]} fontSize={11} stroke="currentColor" width={32} />
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
            formatter={(value, key) => [
              key === "media" ? `${value} / 100` : String(value),
              key === "media" ? "Media" : "Dispersión",
            ]}
          />
          <Bar dataKey="media" fill="var(--orange-500)" radius={[4, 4, 0, 0]}>
            <ErrorBar dataKey="dispersion" stroke="var(--navy-700)" width={4} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
