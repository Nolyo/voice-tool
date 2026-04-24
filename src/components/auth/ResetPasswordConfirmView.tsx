interface Props {
  onDone: () => void;
}

export function ResetPasswordConfirmView({ onDone }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm">TODO: ResetPasswordConfirmView (Task 17)</p>
      <button onClick={onDone} className="text-xs underline">
        Close
      </button>
    </div>
  );
}
