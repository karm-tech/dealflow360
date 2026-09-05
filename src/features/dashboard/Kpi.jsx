import { Card } from "../../components/ui";

export function Kpi({ label, value, hint, tone }) {
  return (
    <Card>
      <p className="text-sm text-sand-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone || "text-sand-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-sand-600">{hint}</p>}
    </Card>
  );
}
