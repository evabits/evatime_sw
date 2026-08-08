"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * Kiezen wie er op een lijstscherm in beeld staat.
 *
 * Gedeeld door de standup en de loonverwerking. Twee kopieën zouden uit elkaar
 * drijven zodra er één iets bijkrijgt, en dan doet dezelfde knop op twee
 * schermen net iets anders.
 *
 * De leden komen binnen als `{ id, name }`. De twee schermen noemen die velden
 * zelf anders — `userId`/`userName` op de standup, `userId`/`name` op de
 * loonverwerking — en vertalen dat op hun eigen aanroepplek, zodat dit
 * onderdeel niet twee vormen hoeft te kennen.
 *
 * Wat er bewaard wordt is wie VERBORGEN is, niet wie zichtbaar is; zie
 * hidden-members.ts voor waarom dat de veilige kant is.
 */
export function MemberPicker({
  open,
  onOpenChange,
  members,
  hidden,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Array<{ id: string; name: string | null }>;
  hidden: string[];
  onChange: (hidden: string[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Wie in beeld</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {members.map((m) => {
            const zichtbaar = !hidden.includes(m.id);
            return (
              <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={zichtbaar}
                  onChange={() =>
                    onChange(
                      zichtbaar ? [...hidden, m.id] : hidden.filter((id) => id !== m.id),
                    )
                  }
                />
                {m.name}
              </label>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange([])}>Toon iedereen</Button>
          <Button onClick={() => onOpenChange(false)}>Klaar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
