import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { dashboardStats, recentActivity } from "@/lib/dashboard-data";

const statusStyles: Record<string, string> = {
  Confirmed: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
  Pending: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
  Cancelled: "bg-red-500/10 text-red-700 hover:bg-red-500/10",
  Completed: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/10",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your AI voice
          agents today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat, index) => (
          <StatCard key={stat.title} stat={stat} index={index} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            Latest calls handled by your AI agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((activity) => (
                  <tr key={activity.id} className="border-b last:border-0">
                    <td className="py-4 font-medium">{activity.agent}</td>
                    <td className="py-4 text-muted-foreground">
                      {activity.customer}
                    </td>
                    <td className="py-4">
                      <Badge
                        variant="secondary"
                        className={statusStyles[activity.status]}
                      >
                        {activity.status}
                      </Badge>
                    </td>
                    <td className="py-4 text-right text-muted-foreground">
                      {activity.time}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
