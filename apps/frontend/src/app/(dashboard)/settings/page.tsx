import { Settings } from "lucide-react";

import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Configure workspace preferences, billing, and notifications."
      icon={Settings}
    />
  );
}
