import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen md:flex"><Nav name={user.name} /><main className="flex-1 p-5 md:p-8 max-w-7xl">{children}</main></div>;
}
