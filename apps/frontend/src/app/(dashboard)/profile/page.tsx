import { User } from "lucide-react";

import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export default function ProfilePage() {
  return (
    <PlaceholderPage
      title="Profile"
      description="Manage your account details and team membership."
      icon={User}
    />
  );
}
