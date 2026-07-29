import { BookOpen } from "lucide-react";

import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export default function KnowledgeBasePage() {
  return (
    <PlaceholderPage
      title="Knowledge Base"
      description="Upload documents and FAQs to train your AI agents."
      icon={BookOpen}
    />
  );
}
