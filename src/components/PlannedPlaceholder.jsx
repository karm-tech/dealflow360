import { PageHeader } from "./PageHeader";
import { Card } from "./ui";

// Placeholder for a screen that is not built yet. Names its area and lists what
// it will contain, so nothing pretends to work.
export function PlannedPlaceholder({ title, area, description, willInclude = [] }) {
  return (
    <div className="animate-fadeUp">
      <PageHeader title={title} subtitle={description} />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 rounded-t-xl border-b border-ink-100 bg-ink-50 px-6 py-3">
          <span className="rounded-md bg-ink-700 px-2 py-0.5 text-2xs font-semibold uppercase text-white">
            Planned
          </span>
          <p className="text-base font-medium text-ink-700">{area}</p>
        </div>

        {willInclude.length > 0 && (
          <div className="px-6 py-5">
            <p className="text-2xs font-semibold uppercase text-sand-600">This screen will have</p>
            <ul className="mt-3 space-y-2">
              {willInclude.map((item) => (
                <li key={item} className="flex gap-3 text-base text-sand-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-ink-200" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
