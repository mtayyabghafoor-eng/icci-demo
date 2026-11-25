"use client";
// The room screen's form (slice P1.13), phone-first: the label number (typed,
// or read by the camera inside the app), the name, and an optional photo.
// Kind and category are copied from the last item here and can be changed
// under "Change kind or category". The place never changes.
import { useActionState, useRef, startTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { BarcodeCamera, type ScanTarget } from "@/components/shell/camera-scanner";
import { FormError } from "@/app/sign-in/ui";
import { codeFromScan } from "@/lib/items/scan";
import type { CategoryGroup } from "@/lib/categories/rules";
import type { RoomDefaults } from "@/lib/places/room-register";
import { CategoryOptions } from "../../../categories/options";
import { PhotoInput } from "../../../items/photo-input";
import { registerInRoom, type RoomFormState } from "./actions";

export function RoomForm(props: {
  placeId: string;
  label: string;
  defaults: RoomDefaults;
  /** Switched-on main categories with their sub-categories (P1.17). */
  categoryGroups: CategoryGroup[];
  stockAllowed: boolean;
}) {
  const { placeId, defaults } = props;
  const [state, action, pending] = useActionState<RoomFormState, FormData>(registerInRoom.bind(null, placeId), { error: null });
  const photo = useRef<File | null>(null);
  const categoryName = props.categoryGroups.flatMap((g) => g.subs).find((c) => c.id === defaults.category_id)?.name;

  // The camera inside the app: an item label comes back to this screen with
  // its number filled in. A2: the next room's door label opens that room's
  // page, where "Register a room" starts registering there (it also tells
  // the phone's own Camera app which room the next labels belong to).
  const camera: ScanTarget = {
    formats: ["qr_code"],
    accept: codeFromScan,
    hrefFor: (path) =>
      path.startsWith("/p/") ? path : `/places/${placeId}/register?label=${path.replace(/^\/l\//, "")}`,
    title: "Scan the next label",
    hint: "Point the camera at the square code on the item's label, or on the next room's door label.",
    wrongCode: "That code is not an ICCI label. Point the camera at the square code on an item or door label.",
    testId: "room-camera",
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (photo.current) data.set("photo", photo.current);
        startTransition(() => action(data));
      }}
    >
      <BarcodeCamera target={camera} />
      <Field id="room-label" label="Label number" help="Scan it, or type the number printed under the code.">
        <Input id="room-label" name="label" required defaultValue={props.label} placeholder="ICCI-000123" autoComplete="off" className="font-mono" />
      </Field>
      <Field id="room-name" label="Name">
        <Input id="room-name" name="name" required maxLength={200} autoFocus={Boolean(props.label)} placeholder="e.g. Stacking chair 12" />
      </Field>
      <PhotoInput label="Photo (optional)" onPhoto={(f) => (photo.current = f)} />

      <details open={!defaults.copied} className="rounded-xl border border-icci-line bg-white px-4 py-3" data-testid="copied-details">
        <summary className="cursor-pointer font-semibold">
          {defaults.copied ? (
            <>
              {defaults.kind === "consumable" ? "Consumable" : "Fixed asset"}
              {categoryName ? ` · ${categoryName}` : ""}{" "}
              <span className="font-normal text-icci-ink-60">(copied from the last item here)</span>
              <span className="mt-1 block text-sm font-normal text-icci-green">Change kind or category</span>
            </>
          ) : (
            "Change kind or category"
          )}
        </summary>
        <div className="mt-3 space-y-4">
          <fieldset>
            <legend className="text-[15px] font-semibold">Kind of item</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(
                [
                  ["fixed_asset", "Fixed asset"],
                  ["consumable", "Consumable"],
                ] as const
              )
                .filter(([value]) => value === "fixed_asset" || props.stockAllowed)
                .map(([value, title]) => (
                  <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#87948f] bg-white px-3 has-[:checked]:border-icci-green-dark has-[:checked]:bg-icci-green-50">
                    <input type="radio" name="kind" value={value} defaultChecked={defaults.kind === value} className="accent-icci-green-dark" />
                    <span className="font-semibold">{title}</span>
                  </label>
                ))}
            </div>
            {!props.stockAllowed && <p className="mt-1 text-sm text-icci-ink-60">Stock is registered in a store room or on a shelf.</p>}
          </fieldset>
          <Field id="room-category" label="Category">
            <Select id="room-category" name="category_id" required defaultValue={defaults.category_id}>
              <option value="" disabled>
                Choose a category
              </option>
              <CategoryOptions groups={props.categoryGroups} />
            </Select>
          </Field>
          {props.stockAllowed && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="room-unit" label="Counted in (unit)" help="Only for consumables.">
                <Input id="room-unit" name="unit" maxLength={40} defaultValue={defaults.unit} placeholder="box, roll…" />
              </Field>
              <Field id="room-minimum" label="Minimum level" help="Only for consumables.">
                <Input id="room-minimum" name="minimum_level" type="number" min={0} step={1} inputMode="numeric" defaultValue={defaults.minimum_level} />
              </Field>
            </div>
          )}
        </div>
      </details>

      <FormError message={state.error} />
      <Button type="submit" kind="primary" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save and scan the next"}
      </Button>
    </form>
  );
}
