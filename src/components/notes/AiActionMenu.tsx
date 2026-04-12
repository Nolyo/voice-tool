import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, ChevronRight, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAI_ACTIONS, getCustomPrompt, type AiAction } from "@/lib/ai-prompts";

interface AiActionMenuProps {
  onAction: (systemPrompt: string) => void;
  isLoading: boolean;
  disabled: boolean;
}

export function AiActionMenu({
  onAction,
  isLoading,
  disabled,
}: AiActionMenuProps) {
  const { t } = useTranslation();
  const aiActions = getAI_ACTIONS();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setHoveredGroup(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleAction = (action: AiAction) => {
    onAction(action.systemPrompt);
    setIsOpen(false);
    setHoveredGroup(null);
  };

  const handleCustomSubmit = () => {
    if (!customPrompt.trim()) return;
    onAction(getCustomPrompt(customPrompt));
    setIsOpen(false);
    setHoveredGroup(null);
    setCustomPrompt("");
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-foreground"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {t('ai.button')}
      </Button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full right-0 mb-1 w-52 bg-popover text-popover-foreground border rounded-md shadow-lg py-1 z-50"
        >
          {aiActions.map((group, groupIdx) => {
            // Direct action (no sub-menu)
            if (group.actions && group.actions.length === 1) {
              const action = group.actions[0];
              return (
                <button
                  key={action.id}
                  className="flex items-center w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleAction(action)}
                  onMouseEnter={() => setHoveredGroup(null)}
                >
                  {group.label}
                </button>
              );
            }

            // Group with sub-actions
            if (group.subActions) {
              return (
                <div
                  key={groupIdx}
                  className="relative"
                  onMouseEnter={() => setHoveredGroup(groupIdx)}
                  onMouseLeave={() => setHoveredGroup(null)}
                >
                  <button className="flex items-center justify-between w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors">
                    {group.label}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>

                  {hoveredGroup === groupIdx && (
                    <div className="absolute right-full top-0 mr-0.5 w-44 bg-popover text-popover-foreground border rounded-md shadow-lg py-1">
                      {group.subActions.map((action) => (
                        <button
                          key={action.id}
                          className="flex items-center w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                          onClick={() => handleAction(action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Separator */}
          <div className="my-1 border-t" />

          {/* Custom prompt */}
          <div className="px-2 py-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="flex-1 text-xs bg-transparent border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('ai.customPromptPlaceholder')}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                disabled={!customPrompt.trim()}
                onClick={handleCustomSubmit}
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
