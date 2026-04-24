import type { AuthView } from "./AuthModal";

interface Props {
  onNavigate: (v: AuthView) => void;
}

export function ResetPasswordRequestView({ onNavigate }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm">TODO: ResetPasswordRequestView (Task 17)</p>
      <button onClick={() => onNavigate("login")} className="text-xs underline">
        Back to login
      </button>
    </div>
  );
}
