import { redirect } from "next/navigation";

// Dashboard ships in Phase 2; until then the catalogue is home.
export default function Home() {
  redirect("/cards");
}
