// Slice A6: a page or record that does not exist, inside the signed-in
// area (the menu stays). Shown when a page calls notFound(), for example an
// item address with a mistyped number.
import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10" data-testid="not-found">
      <EmptyState
        icon={SearchX}
        title="This page could not be found"
        action={<LinkButton href="/">Go to Home</LinkButton>}
      >
        The address may be mistyped, or the record may have been switched off. Nothing has been changed.
      </EmptyState>
    </main>
  );
}
