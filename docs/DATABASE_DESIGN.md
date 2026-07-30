# Database Design

## Project

AI Voice Automation Platform

---

# Design Principles

- Multi-tenant architecture (Workspace based)
- Marketplace agnostic
- AI-first workflow
- Event-driven architecture
- Scalable for SaaS
- UUID primary keys
- Soft deletes where applicable

---

# Core Workflow

Marketplace
        ↓
Import Job
        ↓
Order
        ↓
Assign AI Agent
        ↓
Call Queue
        ↓
Call
        ↓
Transcript
        ↓
Analytics

---

# Models

## Workspace

Purpose:
Represents a company using the platform.

Relations:
- Users
- Customers
- Orders
- AI Agents
- Knowledge Bases
- Marketplace Connections

---

## User

Purpose:
Platform users belonging to a workspace.

Relations:
- Workspace

---

## Customer

Purpose:
Stores customer information.

Relations:
- Workspace
- Orders
- Calls

---

## Order

Purpose:
Stores every imported or manually created order.

Sources:
- Amazon
- Shopify
- WooCommerce
- Flipkart
- Blinkit
- Zepto
- CSV
- Manual
- API

Relations:
- Customer
- Order Items
- Call Queue

---

## Order Item

Purpose:
Stores products inside an order.

Relations:
- Order

---

## AI Agent

Purpose:
Represents an AI voice agent.

Examples:
- Order Confirmation
- COD Verification
- Payment Reminder
- Feedback Collection

Relations:
- Knowledge Base
- Call Queue

---

## Call Queue

Purpose:
Queue for AI calls.

Statuses:
- Queued
- Scheduled
- Calling
- Completed
- Failed
- Cancelled

Relations:
- Order
- AI Agent

---

## Call

Purpose:
Represents every phone call attempt.

Relations:
- Queue
- Transcript

---

## Transcript

Purpose:
Stores AI conversation transcript.

Relations:
- Call

---

## Knowledge Base

Purpose:
Stores PDFs, FAQs and websites used by AI.

Relations:
- AI Agents

---

## Marketplace Connection

Purpose:
Stores marketplace credentials.

Supported:
- Amazon
- Shopify
- Flipkart
- WooCommerce
- Blinkit
- Zepto

---

## Import Job

Purpose:
Tracks CSV uploads and marketplace syncs.

Sources:
- CSV
- API
- Marketplace

---

## Automation

Purpose:
Stores workflow automation rules.

Example:
Order Created
        ↓
Assign AI Agent
        ↓
Queue Call

---

# Next Step

Convert this design into Prisma schema.

# Common Fields

Every model should include:

- id (UUID)
- createdAt
- updatedAt

Soft delete will be added only where required.

---

# Enums

## Marketplace

- AMAZON
- FLIPKART
- SHOPIFY
- WOOCOMMERCE
- BLINKIT
- ZEPTO
- MANUAL
- CSV
- API
- WEBHOOK

---

## PaymentType

- PREPAID
- COD
- PARTIAL_COD

---

## OrderStatus

- PENDING
- CONFIRMED
- SHIPPED
- DELIVERED
- CANCELLED
- RETURNED

---

## QueueStatus

- QUEUED
- SCHEDULED
- CALLING
- COMPLETED
- FAILED
- CANCELLED

---

## CallStatus

- RINGING
- CONNECTED
- FAILED
- NO_ANSWER
- BUSY
- VOICEMAIL

---

# Indexes

Add indexes on:

- customer.phone
- order.marketplaceOrderId
- order.status
- callQueue.status
- callQueue.scheduledAt
- call.startedAt