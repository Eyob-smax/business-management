import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/** The entry point just routes people to the right home screen. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.role === "admin" ? "/admin" : "/staff");
}
