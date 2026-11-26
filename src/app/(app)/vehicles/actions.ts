"use server";
// What happens when the vehicle forms are sent (slice P2.7). Runs on the web
// server as the signed-in admin: the database's rules decide what is allowed
// (unique registrations, a switched-on keeper or nobody, no future renewal
// dates, entries withdrawn with a reason and never changed or deleted).
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyVehicleError, parseRenewalForm, parseVehicleForm } from "@/lib/vehicles/rules";
import { parseWithdrawReason, todayInDublin } from "@/lib/vetting/rules";
import { UUID, formGetter } from "@/lib/forms";
import { NOT_FOUND, anyBad, isBool, isId, isUuid } from "@/lib/action-input";

export type VehicleFormState = { error: string | null };

export async function addVehicle(_state: VehicleFormState, form: FormData): Promise<VehicleFormState> {
  const itemId = formGetter(form)("item_id").trim();
  if (!UUID.test(itemId)) return { error: "Please pick the asset this vehicle is." };
  const parsed = parseVehicleForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").insert({ item_id: itemId, ...parsed.values }).select("id").single();
  if (error) return { error: friendlyVehicleError(error.message) };
  redirect(`/vehicles/${data.id}?done=added`);
}

export async function saveVehicle(vehicleId: string, _state: VehicleFormState, form: FormData): Promise<VehicleFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(vehicleId))) return { error: NOT_FOUND };
  if (!UUID.test(vehicleId)) return { error: "This vehicle could not be found." };
  const parsed = parseVehicleForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").update(parsed.values).eq("id", vehicleId).select("id");
  if (error) return { error: friendlyVehicleError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`/vehicles/${vehicleId}?done=saved`);
}

export async function setVehicleActive(vehicleId: string, active: boolean): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(vehicleId), isBool(active))) notFound();
  if (!UUID.test(vehicleId)) redirect("/vehicles");
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").update({ active }).eq("id", vehicleId).select("id");
  if (error || !data?.length) redirect(`/vehicles/${vehicleId}?done=not-allowed`);
  redirect(`/vehicles/${vehicleId}?done=${active ? "switched-on" : "switched-off"}`);
}

export async function recordRenewal(vehicleId: string, _state: VehicleFormState, form: FormData): Promise<VehicleFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(vehicleId))) return { error: NOT_FOUND };
  if (!UUID.test(vehicleId)) return { error: "This vehicle could not be found." };
  const parsed = parseRenewalForm(formGetter(form), todayInDublin());
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_renewals").insert({ vehicle_id: vehicleId, ...parsed.values });
  if (error) return { error: friendlyVehicleError(error.message) };
  redirect(`/vehicles/${vehicleId}?done=renewed`);
}

export async function withdrawRenewal(vehicleId: string, renewalId: number, form: FormData): Promise<void> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(isUuid(vehicleId), isId(renewalId))) notFound();
  if (!UUID.test(vehicleId) || !Number.isSafeInteger(renewalId)) redirect("/vehicles");
  const reason = parseWithdrawReason(formGetter(form)("reason"));
  if (!reason.ok) redirect(`/vehicles/${vehicleId}?done=withdraw-reason`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_renewals")
    .update({ withdrawn_reason: reason.values })
    .eq("id", renewalId)
    .eq("vehicle_id", vehicleId)
    .select("id");
  if (error) redirect(`/vehicles/${vehicleId}?done=withdraw-refused`);
  if (!data?.length) redirect(`/vehicles/${vehicleId}?done=not-allowed`);
  redirect(`/vehicles/${vehicleId}?done=withdrawn`);
}
