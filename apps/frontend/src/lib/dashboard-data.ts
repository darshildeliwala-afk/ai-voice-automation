export type StatCardData = {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  description: string;
};

export const dashboardStats: StatCardData[] = [
  {
    title: "Total Calls",
    value: "12,847",
    change: "+12.5%",
    trend: "up",
    description: "vs. last 30 days",
  },
  {
    title: "Connected Agents",
    value: "8",
    change: "+2",
    trend: "up",
    description: "active this week",
  },
  {
    title: "Today's Orders",
    value: "342",
    change: "+18%",
    trend: "up",
    description: "vs. yesterday",
  },
  {
    title: "Success Rate",
    value: "94.2%",
    change: "+2.1%",
    trend: "up",
    description: "confirmation rate",
  },
];

export const recentActivity = [
  {
    id: 1,
    agent: "Order Confirmation",
    customer: "Priya Sharma",
    status: "Confirmed",
    time: "2 min ago",
  },
  {
    id: 2,
    agent: "COD Verification",
    customer: "Rahul Mehta",
    status: "Pending",
    time: "8 min ago",
  },
  {
    id: 3,
    agent: "Order Confirmation",
    customer: "Ananya Patel",
    status: "Cancelled",
    time: "15 min ago",
  },
  {
    id: 4,
    agent: "Feedback Collection",
    customer: "Vikram Singh",
    status: "Completed",
    time: "22 min ago",
  },
];
