# Agent Directives & Project Rules

## Platform Roles & Architecture
1. **Web App (`Smart-Flush-Web-App`)**: Exclusively for **Administrators** (`admin`).
   - Admins manage facilities, review and moderate public issue reports, configure hardware and automation rules, and trigger task creation.
2. **Mobile App (`Smart-Flush-Mobile-App`)**: For **Supervisors** (`supervisor`) and **Technicians** (`maintenance`).
   - Supervisors review maintenance execution, reassign tasks, and approve or flag completed work.
   - Technicians acknowledge, inspect, and complete physical maintenance jobs on mobile devices.

## Implementation Plan Requirements
1. **Universal Checklists**:
   - Every implementation plan MUST have explicit markdown checklists (`- [ ]`).
   - Implementation phases, logic audits, automated test verifications, AND **manual verification steps** must all have checklist items.
   - Manual verification steps must never be plain bullet points; they must be structured as actionable checklist items (`- [ ]`).
