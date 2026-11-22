// Reading a sent form on the web server: every field as plain text (an
// empty string when missing or a file), and every ticked box of a group.
// Shared by all the form actions so the same few lines are not repeated.
export type Get = (name: string) => string;

export function formGetter(form: FormData): Get {
  return (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
}

export function formGetAll(form: FormData): (name: string) => string[] {
  return (name: string) => form.getAll(name).filter((v): v is string => typeof v === "string");
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
