use client';
import { useRouter } from "next/navigation";
export default function LogoutButton() {
  const router = useRouter();
  return <button onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"}); router.replace("/login"); router.refresh();}} className="text-sm text-gray-500 hover:text-gray-900">יציאה</button>;
}
