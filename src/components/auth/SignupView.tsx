import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

export function SignupView({ onNavigate }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm">TODO: SignupView (Task 16)</p>
      <button onClick={() => onNavigate("login")} className="text-xs underline">
        Back to login
      </button>
    </div>
  );
}
