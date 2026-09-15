import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import ClassificationAttentionBanner from "@/components/ClassificationAttentionBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="app-shell">
      <Nav name={user.name} />
      <main className="app-main">
        <div className="app-content">
          <ClassificationAttentionBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
