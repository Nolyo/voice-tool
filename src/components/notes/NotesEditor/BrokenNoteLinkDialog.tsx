import { useTranslation } from "react-i18next";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BrokenNoteLinkDialogProps {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BrokenNoteLinkDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
}: BrokenNoteLinkDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("notes.link.brokenDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("notes.link.brokenDialogDesc", { title })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onConfirm}>
            <FilePlus2 className="w-4 h-4 mr-1" />
            {t("notes.link.brokenDialogConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
