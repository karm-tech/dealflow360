import { Link } from "react-router-dom";
import { MarkGround } from "../../components/MarkGround";
import { Wordmark } from "../../components/Wordmark";

// Shared frame for /login and /demo so both sit in the same place on screen.
// `strip` renders full width above everything.
export function AuthShell({ strip, children }) {
  return (
    <MarkGround className="min-h-screen">
      {strip}
      <div className="flex flex-col items-center justify-center gap-6 px-4 py-12">
        <Link to="/" className="rounded-lg">
          <Wordmark size="lg" />
        </Link>
        <div className="w-full max-w-md space-y-4">{children}</div>
      </div>
    </MarkGround>
  );
}
