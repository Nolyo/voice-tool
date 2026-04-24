import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

export function LoginView({ onNavigate }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm">TODO: LoginView (Task 15)</p>
      <button onClick={() => onNavigate("signup")} className="text-xs underline">
        Go to signup
      </button>
    </div>
  );
}
