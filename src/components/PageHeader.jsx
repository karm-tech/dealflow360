// One heading style for every screen, so pages line up with each other.
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-sand-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-base text-sand-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
