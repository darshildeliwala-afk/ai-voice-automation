import type { Order } from "@/lib/orders/types";

export const SAMPLE_CSV_CONTENT = `order_number,customer_name,phone,address,amount
ORD-5001,Aditi Verma,+91 98765 43210,"42 MG Road, Bangalore, 560001",3499.00
ORD-5002,Rohan Kapoor,+91 91234 56789,"18 Park Street, Kolkata, 700016",1899.50
ORD-5003,Neha Gupta,+91 99887 76655,"7 Connaught Place, New Delhi, 110001",5240.00
ORD-5004,Vikram Singh,+91 97654 32109,"55 FC Road, Pune, 411004",2799.00
ORD-5005,Priya Sharma,+91 96543 21098,"12 Linking Road, Mumbai, 400050",4150.75`;

export const initialOrders: Order[] = [
  {
    id: "ord-001",
    orderNumber: "ORD-1042",
    customerName: "Priya Sharma",
    phone: "+91 98765 11101",
    address: "12 Linking Road, Mumbai, 400050",
    amount: 2499,
    status: "Completed",
    createdAt: "2026-07-29T08:12:00Z",
  },
  {
    id: "ord-002",
    orderNumber: "ORD-1043",
    customerName: "Rahul Mehta",
    phone: "+91 98765 11102",
    address: "88 SG Highway, Ahmedabad, 380015",
    amount: 1899,
    status: "Calling",
    createdAt: "2026-07-29T08:45:00Z",
  },
  {
    id: "ord-003",
    orderNumber: "ORD-1044",
    customerName: "Ananya Patel",
    phone: "+91 98765 11103",
    address: "23 CG Road, Ahmedabad, 380009",
    amount: 3299,
    status: "Queued",
    createdAt: "2026-07-29T09:01:00Z",
  },
  {
    id: "ord-004",
    orderNumber: "ORD-1045",
    customerName: "Vikram Singh",
    phone: "+91 98765 11104",
    address: "55 FC Road, Pune, 411004",
    amount: 999,
    status: "Failed",
    createdAt: "2026-07-29T09:18:00Z",
  },
  {
    id: "ord-005",
    orderNumber: "ORD-1046",
    customerName: "Sneha Reddy",
    phone: "+91 98765 11105",
    address: "9 Jubilee Hills, Hyderabad, 500033",
    amount: 4599,
    status: "Pending",
    createdAt: "2026-07-29T09:30:00Z",
  },
  {
    id: "ord-006",
    orderNumber: "ORD-1047",
    customerName: "Arjun Nair",
    phone: "+91 98765 11106",
    address: "14 Marine Drive, Kochi, 682031",
    amount: 2199,
    status: "Completed",
    createdAt: "2026-07-29T09:42:00Z",
  },
  {
    id: "ord-007",
    orderNumber: "ORD-1048",
    customerName: "Kavya Iyer",
    phone: "+91 98765 11107",
    address: "6 Anna Salai, Chennai, 600002",
    amount: 1750,
    status: "Queued",
    createdAt: "2026-07-29T10:05:00Z",
  },
  {
    id: "ord-008",
    orderNumber: "ORD-1049",
    customerName: "Mohit Agarwal",
    phone: "+91 98765 11108",
    address: "31 Mall Road, Lucknow, 226001",
    amount: 3899,
    status: "Pending",
    createdAt: "2026-07-29T10:22:00Z",
  },
  {
    id: "ord-009",
    orderNumber: "ORD-1050",
    customerName: "Divya Joshi",
    phone: "+91 98765 11109",
    address: "2 MI Road, Jaipur, 302001",
    amount: 1299,
    status: "Completed",
    createdAt: "2026-07-29T10:38:00Z",
  },
  {
    id: "ord-010",
    orderNumber: "ORD-1051",
    customerName: "Karan Malhotra",
    phone: "+91 98765 11110",
    address: "19 Sector 17, Chandigarh, 160017",
    amount: 5499,
    status: "Calling",
    createdAt: "2026-07-29T11:00:00Z",
  },
  {
    id: "ord-011",
    orderNumber: "ORD-1052",
    customerName: "Isha Desai",
    phone: "+91 98765 11111",
    address: "8 Law Garden, Ahmedabad, 380006",
    amount: 2899,
    status: "Failed",
    createdAt: "2026-07-29T11:15:00Z",
  },
  {
    id: "ord-012",
    orderNumber: "ORD-1053",
    customerName: "Aman Khanna",
    phone: "+91 98765 11112",
    address: "44 Brigade Road, Bangalore, 560025",
    amount: 1999,
    status: "Pending",
    createdAt: "2026-07-29T11:28:00Z",
  },
  {
    id: "ord-013",
    orderNumber: "ORD-1054",
    customerName: "Ritu Bansal",
    phone: "+91 98765 11113",
    address: "17 Civil Lines, Delhi, 110054",
    amount: 3699,
    status: "Queued",
    createdAt: "2026-07-29T11:45:00Z",
  },
  {
    id: "ord-014",
    orderNumber: "ORD-1055",
    customerName: "Sanjay Rao",
    phone: "+91 98765 11114",
    address: "3 Banjara Hills, Hyderabad, 500034",
    amount: 4299,
    status: "Completed",
    createdAt: "2026-07-29T12:02:00Z",
  },
  {
    id: "ord-015",
    orderNumber: "ORD-1056",
    customerName: "Meera Pillai",
    phone: "+91 98765 11115",
    address: "21 MG Road, Trivandrum, 695001",
    amount: 1599,
    status: "Pending",
    createdAt: "2026-07-29T12:20:00Z",
  },
  {
    id: "ord-016",
    orderNumber: "ORD-1057",
    customerName: "Harsh Vora",
    phone: "+91 98765 11116",
    address: "5 SV Road, Mumbai, 400054",
    amount: 2999,
    status: "Completed",
    createdAt: "2026-07-29T12:35:00Z",
  },
  {
    id: "ord-017",
    orderNumber: "ORD-1058",
    customerName: "Pooja Sinha",
    phone: "+91 98765 11117",
    address: "10 Park Street, Kolkata, 700016",
    amount: 3499,
    status: "Calling",
    createdAt: "2026-07-29T12:50:00Z",
  },
  {
    id: "ord-018",
    orderNumber: "ORD-1059",
    customerName: "Dev Thakur",
    phone: "+91 98765 11118",
    address: "33 Mall Road, Shimla, 171001",
    amount: 899,
    status: "Failed",
    createdAt: "2026-07-29T13:05:00Z",
  },
  {
    id: "ord-019",
    orderNumber: "ORD-1060",
    customerName: "Nisha Kapoor",
    phone: "+91 98765 11119",
    address: "27 Rajouri Garden, Delhi, 110027",
    amount: 4799,
    status: "Queued",
    createdAt: "2026-07-29T13:22:00Z",
  },
  {
    id: "ord-020",
    orderNumber: "ORD-1061",
    customerName: "Tarun Menon",
    phone: "+91 98765 11120",
    address: "16 Indiranagar, Bangalore, 560038",
    amount: 2599,
    status: "Pending",
    createdAt: "2026-07-29T13:40:00Z",
  },
  {
    id: "ord-021",
    orderNumber: "ORD-1062",
    customerName: "Lakshmi Venkat",
    phone: "+91 98765 11121",
    address: "4 T Nagar, Chennai, 600017",
    amount: 3199,
    status: "Completed",
    createdAt: "2026-07-29T14:00:00Z",
  },
  {
    id: "ord-022",
    orderNumber: "ORD-1063",
    customerName: "Gaurav Sethi",
    phone: "+91 98765 11122",
    address: "11 Model Town, Jalandhar, 144003",
    amount: 1499,
    status: "Pending",
    createdAt: "2026-07-29T14:18:00Z",
  },
  {
    id: "ord-023",
    orderNumber: "ORD-1064",
    customerName: "Shreya Dutta",
    phone: "+91 98765 11123",
    address: "9 Salt Lake, Kolkata, 700064",
    amount: 3999,
    status: "Queued",
    createdAt: "2026-07-29T14:35:00Z",
  },
  {
    id: "ord-024",
    orderNumber: "ORD-1065",
    customerName: "Abhishek Roy",
    phone: "+91 98765 11124",
    address: "22 Koregaon Park, Pune, 411001",
    amount: 2799,
    status: "Completed",
    createdAt: "2026-07-29T14:52:00Z",
  },
];

export function downloadSampleFile() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-orders.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatOrderDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
