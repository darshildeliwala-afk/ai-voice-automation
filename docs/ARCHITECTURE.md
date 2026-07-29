# AI Voice Automation Platform Architecture

## High Level Architecture

                    Next.js Frontend
                           │
                    REST API / WebSocket
                           │
                    NestJS Backend
                           │
      ┌──────────────┬───────────────┬───────────────┐
      │              │               │
 PostgreSQL       Redis Queue     File Storage
 (Supabase)         (BullMQ)      (Supabase)

                           │
                     AI Agent Engine

      ┌──────────────┬───────────────┬───────────────┐
      │              │               │
  Deepgram        GPT-5.5      ElevenLabs

                           │

                         Plivo

                           │

                     Customer Phone