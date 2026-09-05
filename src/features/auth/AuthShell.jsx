import { Wordmark } from "../../components/Wordmark";

// Shared frame for the two sign-in pages, so /login and /demo sit in the same
// place on the screen and switching between them does not make things jump.
//
// `strip` is rendered full width above everything — the demo page uses it for
// its amber banner.
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
