"use server";
// Register a room (slice P1.13): start, save one item, finish. Runs on the
// web server as the signed-in admin; the database's rules decide what is
// allowed, exactly as for "Register an item" (the same save step is used).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-admin";
import { parseRegister } from "@/lib/items/form";
import { ROOM_COOKIE, ROOM_COOKIE_HOURS, stockAllowedIn } from "@/lib/places/room-register";
import { isPlaceKind } from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { photoFrom } from "../../../items/photos";
import { insertNewItem } from "../../../items/register";
import { UUID } from "../../data";
import { MAY_SEE_PLACES } from "../../page";

export type RoomFormState = { error: string | null };

/** Turns "registering here" on in this browser and opens the room screen. */
export async function startRoomRegister(placeId: string) {
  const me = await requireAdmin();
  if (!MAY_SEE_PLACES.includes(me.roleCode) || !UUID.test(placeId)) redirect("/places");
  (await cookies()).set(ROOM_COOKIE, placeId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * ROOM_COOKIE_HOURS,
  });
  redirect(`/places/${placeId}/register`);
}

/** Turns "registering here" off and goes back to the place. */
export async function finishRoomRegister(placeId: string) {
  (await cookies()).delete(ROOM_COOKIE);
  redirect(UUID.test(placeId) ? `/places/${placeId}` : "/places");
}

/** Saves one item in this place, then comes back for the next label. */
export async function registerInRoom(placeId: string, _state: RoomFormState, form: FormData): Promise<RoomFormState> {
  const me = await requireAdmin();
  if (!MAY_SEE_PLACES.includes(me.roleCode)) return { error: "Your account cannot register items." };
  if (!UUID.test(placeId)) return { error: "This place could not be found." };

  const supabase = await createClient();
  const { data: place } = await supabase.from("locations").select("kind, active").eq("id", placeId).maybeSingle();
  if (!place || !isPlaceKind(place.kind)) return { error: "This place could not be found." };
  if (!place.active) return { error: "This place is switched off. Switch it back on before registering items here." };

  // The place is always this one, whatever the form says.
  const parsed = parseRegister((name) => {
    if (name === "location_id") return placeId;
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  });
  if (!parsed.ok) return { error: parsed.error };
  if (parsed.values.kind === "consumable" && !stockAllowedIn(place.kind)) {
    return { error: "Stock is kept in a store room or on a shelf. Register it there, or choose Fixed asset." };
  }
  const photo = photoFrom(form);
  if (typeof photo === "string") return { error: photo };

  const saved = await insertNewItem(supabase, parsed.values, photo);
  if (saved.error !== null) return { error: saved.error };
  redirect(`/places/${placeId}/register?done=${parsed.values.label_serial}`);
}
