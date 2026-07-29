# Database Design (MVP)

## companies

Stores every customer/company using the platform.

Fields:

- id
- company_name
- email
- phone
- created_at

---

## users

Stores login users.

Fields:

- id
- company_id
- name
- email
- password
- role
- created_at

---

## ai_agents

Each company can create multiple AI agents.

Fields:

- id
- company_id
- name
- workflow_type
- language
- voice
- prompt
- status
- created_at

---

## orders

Stores uploaded orders.

Fields:

- id
- company_id
- order_number
- customer_name
- phone
- address
- amount
- status
- created_at

---

## calls

Stores every phone call.

Fields:

- id
- order_id
- agent_id
- plivo_call_id
- duration
- recording_url
- transcript
- summary
- sentiment
- outcome
- created_at