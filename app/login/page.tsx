import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <LoginForm />;
}
