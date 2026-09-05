import { Wordmark } from "../../components/Wordmark";

// Shared frame for /login and /demo so both sit in the same place on screen.
// `strip` renders full width above everything.
export function AuthShell({ strip, children }) {
  return (
    <div className="min-h-screen bg-canvas">
      {strip}
      <div className="flex flex-col items-center justify-center gap-6 px-4 py-12">
        <Wordmark size="lg" />
        <div className="w-full max-w-md space-y-4">{children}</div>
      </div>
    </div>
  );
}
