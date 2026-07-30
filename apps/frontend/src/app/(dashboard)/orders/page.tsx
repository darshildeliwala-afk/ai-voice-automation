"use client";

import { useState } from "react";

import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Edit3,
  Eye,
  FileText,
  Globe2,
  Mail,
  Package,
  Phone,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const kpis = [
  {
    label: "Total Orders",
    value: "1,248",
    trend: "+12.5% from last month",
    icon: ShoppingBag,
    iconClass: "bg-violet-500/10 text-violet-600",
  },
  {
    label: "Pending Calls",
    value: "182",
    trend: "24 need attention",
    icon: Clock3,
    iconClass: "bg-amber-500/10 text-amber-600",
  },
  {
    label: "Confirmed",
    value: "931",
    trend: "+8.2% completion rate",
    icon: CheckCircle2,
    iconClass: "bg-emerald-500/10 text-emerald-600",
  },
  {
    label: "Failed",
    value: "57",
    trend: "4.6% of total calls",
    icon: CircleAlert,
    iconClass: "bg-rose-500/10 text-rose-600",
  },
  {
    label: "Today's Orders",
    value: "86",
    trend: "+18.4% vs. yesterday",
    icon: Package,
    iconClass: "bg-blue-500/10 text-blue-600",
  },
] as const;

const orders = [
  { id: "ORD-10482", customer: "Aarav Mehta", email: "aarav@example.com", marketplace: "Shopify", amount: "₹2,499", payment: "Prepaid", status: "Confirmed", aiStatus: "Completed" },
  { id: "ORD-10481", customer: "Priya Sharma", email: "priya@example.com", marketplace: "Amazon", amount: "₹1,899", payment: "COD", status: "Pending", aiStatus: "Calling" },
  { id: "ORD-10480", customer: "Rohan Kapoor", email: "rohan@example.com", marketplace: "Flipkart", amount: "₹3,250", payment: "Prepaid", status: "Confirmed", aiStatus: "Completed" },
  { id: "ORD-10479", customer: "Neha Gupta", email: "neha@example.com", marketplace: "Shopify", amount: "₹749", payment: "COD", status: "Pending", aiStatus: "Queued" },
  { id: "ORD-10478", customer: "Vikram Singh", email: "vikram@example.com", marketplace: "Amazon", amount: "₹4,199", payment: "Prepaid", status: "Cancelled", aiStatus: "Failed" },
  { id: "ORD-10477", customer: "Ishita Verma", email: "ishita@example.com", marketplace: "Meesho", amount: "₹1,299", payment: "COD", status: "Confirmed", aiStatus: "Completed" },
  { id: "ORD-10476", customer: "Kunal Bansal", email: "kunal@example.com", marketplace: "Flipkart", amount: "₹2,050", payment: "Prepaid", status: "Pending", aiStatus: "Calling" },
  { id: "ORD-10475", customer: "Ananya Iyer", email: "ananya@example.com", marketplace: "Shopify", amount: "₹3,799", payment: "Prepaid", status: "Confirmed", aiStatus: "Completed" },
  { id: "ORD-10474", customer: "Siddharth Rao", email: "siddharth@example.com", marketplace: "Amazon", amount: "₹999", payment: "COD", status: "Cancelled", aiStatus: "Failed" },
  { id: "ORD-10473", customer: "Meera Nair", email: "meera@example.com", marketplace: "Meesho", amount: "₹1,650", payment: "COD", status: "Pending", aiStatus: "Queued" },
] as const;

const orderStatusStyles: Record<(typeof orders)[number]["status"], string> = {
  Pending: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
  Confirmed: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
  Cancelled: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/10",
};

const aiStatusStyles: Record<(typeof orders)[number]["aiStatus"], string> = {
  Queued: "bg-slate-500/10 text-slate-600 hover:bg-slate-500/10",
  Calling: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/10",
  Completed: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
  Failed: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/10",
};

const orderDetails = {
  phone: "+91 98765 43210",
  date: "Jul 30, 2026 · 10:24 AM",
  products: [
    { name: "Classic Cotton T-Shirt", variant: "Navy / Medium", quantity: 1, price: "₹1,299" },
    { name: "Everyday Crew Socks", variant: "White / Pack of 3", quantity: 2, price: "₹600" },
  ],
  agent: "Priya · Order Confirmation",
  language: "English (India)",
  knowledgeBase: "Synced · 14 minutes ago",
  notes: "Customer asked for delivery after 6 PM. Confirm the preferred time window during the next call.",
  timeline: [
    { title: "Order created", detail: "Order received from marketplace", time: "10:24 AM" },
    { title: "AI call scheduled", detail: "Confirmation workflow queued", time: "10:26 AM" },
    { title: "Customer contacted", detail: "Initial call attempt completed", time: "10:31 AM" },
    { title: "Order confirmed", detail: "Delivery details verified", time: "10:33 AM" },
  ],
};

export default function OrdersPage() {
  const [selectedOrder, setSelectedOrder] = useState<(typeof orders)[number] | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Orders</h1>
          <p className="mt-1 text-muted-foreground">Manage customer orders and AI calling workflow.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setIsNewOrderOpen(true)}>
          <Plus data-icon="inline-start" />
          New Order
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Order metrics">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="py-0">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{kpi.value}</p>
                  </div>
                  <span className={`flex size-9 items-center justify-center rounded-lg ${kpi.iconClass}`}>
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="size-3 text-emerald-600" />
                  {kpi.trend}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="py-0">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Search by order ID or customer..." aria-label="Search orders" />
          </div>
          <Select defaultValue="all-statuses">
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all-statuses">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all-marketplaces">
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="All marketplaces" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all-marketplaces">All marketplaces</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
              <SelectItem value="flipkart">Flipkart</SelectItem>
              <SelectItem value="meesho">Meesho</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="py-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-heading font-medium">All Orders</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Showing 10 of 1,248 orders</p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">Live updates</Badge>
        </div>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-3 font-medium">Order ID</th><th className="px-5 py-3 font-medium">Customer</th><th className="px-5 py-3 font-medium">Marketplace</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 font-medium">Payment</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">AI Status</th><th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-4 font-medium text-primary">{order.id}</td>
                    <td className="px-5 py-4"><p className="font-medium">{order.customer}</p><p className="mt-0.5 text-xs text-muted-foreground">{order.email}</p></td>
                    <td className="px-5 py-4 text-muted-foreground">{order.marketplace}</td><td className="px-5 py-4 text-right font-medium">{order.amount}</td><td className="px-5 py-4 text-muted-foreground">{order.payment}</td>
                    <td className="px-5 py-4"><Badge variant="secondary" className={orderStatusStyles[order.status]}>{order.status}</Badge></td>
                    <td className="px-5 py-4"><Badge variant="secondary" className={aiStatusStyles[order.aiStatus]}><Bot className="size-3" />{order.aiStatus}</Badge></td>
                    <td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}><Eye data-icon="inline-start" />View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>

      <Sheet open={isNewOrderOpen} onOpenChange={setIsNewOrderOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" side="right">
          <SheetHeader className="border-b px-6 py-5 pr-14">
            <SheetTitle className="text-xl">Create New Order</SheetTitle>
            <SheetDescription>Add customer, order, shipping, and AI calling details.</SheetDescription>
          </SheetHeader>

          <form className="space-y-5 p-5 pb-28 sm:p-6 sm:pb-28" onSubmit={(event) => { event.preventDefault(); setIsNewOrderOpen(false); }}>
            <CreateOrderSection title="Customer">
              <FormField label="Name" htmlFor="customer-name"><Input id="customer-name" placeholder="Customer name" defaultValue="Riya Malhotra" /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Phone" htmlFor="customer-phone"><Input id="customer-phone" type="tel" placeholder="+91 00000 00000" defaultValue="+91 98765 12345" /></FormField>
                <FormField label="Email" htmlFor="customer-email"><Input id="customer-email" type="email" placeholder="name@example.com" defaultValue="riya@example.com" /></FormField>
              </div>
            </CreateOrderSection>

            <CreateOrderSection title="Order">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Marketplace" htmlFor="new-marketplace"><Select defaultValue="shopify"><SelectTrigger id="new-marketplace" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shopify">Shopify</SelectItem><SelectItem value="amazon">Amazon</SelectItem><SelectItem value="flipkart">Flipkart</SelectItem><SelectItem value="meesho">Meesho</SelectItem></SelectContent></Select></FormField>
                <FormField label="Payment Type" htmlFor="new-payment"><Select defaultValue="cod"><SelectTrigger id="new-payment" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cod">Cash on Delivery</SelectItem><SelectItem value="prepaid">Prepaid</SelectItem><SelectItem value="partial">Partial payment</SelectItem></SelectContent></Select></FormField>
              </div>
              <FormField label="Order Value" htmlFor="order-value"><Input id="order-value" inputMode="numeric" placeholder="₹0.00" defaultValue="₹2,499" /></FormField>
            </CreateOrderSection>

            <CreateOrderSection title="Products">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px_110px]">
                <FormField label="Product Name" htmlFor="product-name"><Input id="product-name" placeholder="Product name" defaultValue="Classic Cotton T-Shirt" /></FormField>
                <FormField label="Quantity" htmlFor="product-quantity"><Input id="product-quantity" type="number" min="1" defaultValue="1" /></FormField>
                <FormField label="Price" htmlFor="product-price"><Input id="product-price" inputMode="numeric" defaultValue="₹1,299" /></FormField>
              </div>
              <Button type="button" variant="outline" size="sm"><Plus data-icon="inline-start" />Add Product</Button>
            </CreateOrderSection>

            <CreateOrderSection title="Shipping">
              <FormField label="Address" htmlFor="shipping-address"><Input id="shipping-address" placeholder="Street address" defaultValue="14, Park View Road, Indiranagar" /></FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="City" htmlFor="shipping-city"><Input id="shipping-city" placeholder="City" defaultValue="Bengaluru" /></FormField>
                <FormField label="State" htmlFor="shipping-state"><Input id="shipping-state" placeholder="State" defaultValue="Karnataka" /></FormField>
              </div>
              <FormField label="PIN Code" htmlFor="shipping-pin"><Input id="shipping-pin" inputMode="numeric" placeholder="000000" defaultValue="560038" /></FormField>
            </CreateOrderSection>

            <CreateOrderSection title="AI Configuration">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Agent" htmlFor="ai-agent"><Select defaultValue="priya"><SelectTrigger id="ai-agent" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="priya">Priya · Order Confirmation</SelectItem><SelectItem value="arjun">Arjun · Follow-up</SelectItem><SelectItem value="maya">Maya · Support</SelectItem></SelectContent></Select></FormField>
                <FormField label="Language" htmlFor="ai-language"><Select defaultValue="en-in"><SelectTrigger id="ai-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en-in">English (India)</SelectItem><SelectItem value="hi-in">Hindi</SelectItem><SelectItem value="hinglish">Hinglish</SelectItem></SelectContent></Select></FormField>
                <FormField label="Priority" htmlFor="ai-priority"><Select defaultValue="standard"><SelectTrigger id="ai-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="standard">Standard</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></FormField>
                <FormField label="Schedule" htmlFor="ai-schedule"><Select defaultValue="now"><SelectTrigger id="ai-schedule" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="now">Queue immediately</SelectItem><SelectItem value="afternoon">Today, 2:00 PM</SelectItem><SelectItem value="tomorrow">Tomorrow, 10:00 AM</SelectItem></SelectContent></Select></FormField>
              </div>
            </CreateOrderSection>
          </form>

          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-background p-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" type="button" onClick={() => setIsNewOrderOpen(false)}>Cancel</Button>
            <Button variant="outline" type="button" onClick={() => setIsNewOrderOpen(false)}><Save data-icon="inline-start" />Save Draft</Button>
            <Button type="button" onClick={() => setIsNewOrderOpen(false)}><Phone data-icon="inline-start" />Create &amp; Queue AI Call</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={selectedOrder !== null} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" side="right">
          {selectedOrder && (
            <>
              <SheetHeader className="border-b px-6 py-5 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-xl">{selectedOrder.id}</SheetTitle>
                  <Badge variant="secondary" className={orderStatusStyles[selectedOrder.status]}>{selectedOrder.status}</Badge>
                </div>
                <SheetDescription>Order details and AI call workflow</SheetDescription>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm"><Phone data-icon="inline-start" />Start AI Call</Button>
                  <Button size="sm" variant="outline"><Edit3 data-icon="inline-start" />Edit</Button>
                </div>
              </SheetHeader>

              <div className="space-y-5 p-5 sm:p-6">
                <DetailCard title="Customer" icon={UserRound}>
                  <DetailRow label="Name" value={selectedOrder.customer} />
                  <DetailRow label="Phone" value={orderDetails.phone} icon={Phone} />
                  <DetailRow label="Email" value={selectedOrder.email} icon={Mail} />
                </DetailCard>

                <DetailCard title="Order" icon={Package}>
                  <DetailRow label="Marketplace" value={selectedOrder.marketplace} icon={Globe2} />
                  <DetailRow label="Payment" value={selectedOrder.payment} />
                  <DetailRow label="Order value" value={selectedOrder.amount} valueClassName="font-semibold text-foreground" />
                  <DetailRow label="Order date" value={orderDetails.date} />
                </DetailCard>

                <DetailCard title="Products" icon={ShoppingBag}>
                  <div className="space-y-3">
                    {orderDetails.products.map((product) => (
                      <div key={product.name} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
                        <div><p className="font-medium">{product.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{product.variant} · Qty {product.quantity}</p></div>
                        <p className="shrink-0 font-medium">{product.price}</p>
                      </div>
                    ))}
                  </div>
                </DetailCard>

                <DetailCard title="AI Status" icon={Sparkles}>
                  <DetailRow label="AI readiness" value={<Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">Ready to call</Badge>} />
                  <DetailRow label="Assigned agent" value={orderDetails.agent} />
                  <DetailRow label="Preferred language" value={orderDetails.language} />
                  <DetailRow label="Knowledge Base" value={orderDetails.knowledgeBase} />
                </DetailCard>

                <DetailCard title="Timeline" icon={Clock3}>
                  <div className="space-y-0">
                    {orderDetails.timeline.map((event, index) => (
                      <div key={event.title} className="relative flex gap-3 pb-5 last:pb-0">
                        {index < orderDetails.timeline.length - 1 && <span className="absolute top-4 left-[7px] h-[calc(100%-8px)] w-px bg-border" />}
                        <span className="relative mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15"><span className="size-1.5 rounded-full bg-primary" /></span>
                        <div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-x-3"><p className="font-medium">{event.title}</p><p className="text-xs text-muted-foreground">{event.time}</p></div><p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p></div>
                      </div>
                    ))}
                  </div>
                </DetailCard>

                <DetailCard title="Notes" icon={FileText}>
                  <p className="leading-6 text-muted-foreground">{orderDetails.notes}</p>
                </DetailCard>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailCard({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: React.ReactNode }) {
  return <Card className="gap-3 py-0"><div className="flex items-center gap-2 border-b px-4 py-3"><Icon className="size-4 text-muted-foreground" /><h3 className="font-heading font-medium">{title}</h3></div><CardContent className="space-y-3 pb-4">{children}</CardContent></Card>;
}

function DetailRow({ label, value, icon: Icon, valueClassName }: { label: string; value: React.ReactNode; icon?: typeof Phone; valueClassName?: string }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><span className="flex shrink-0 items-center gap-2 text-muted-foreground">{Icon && <Icon className="size-3.5" />}{label}</span><span className={`min-w-0 text-right text-foreground ${valueClassName ?? ""}`}>{value}</span></div>;
}

function CreateOrderSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="gap-4 py-0"><div className="border-b px-4 py-3"><h3 className="font-heading font-medium">{title}</h3></div><CardContent className="space-y-4 pb-4">{children}</CardContent></Card>;
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>{children}</div>;
}
