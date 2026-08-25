# Agent Sidecar Platform

Agent Sidecar Platform provides a reusable contextual Copilot Studio experience for Dataverse Model-driven Apps. HR Management is the reference implementation and includes the human-resources data model below.

## Platform Administration

**Agent Sidecar**:
One app-keyed contextual assistant that connects a target Model-driven App to one existing Copilot Studio agent through a persistent side pane.
_Avoid_: Embedded bot, chatbot panel, global environment agent

**Sidecar Configuration**:
The current desired state for one Agent Sidecar, including its target app, enabled tables, existing agent, pane identity, public-client identifiers, and lifecycle state.
_Avoid_: Installation record, deployment history, bot settings

**Target Binding**:
The sidecar-owned structural customizations that attach one Sidecar Configuration to a target Model-driven App's lists and main forms.
_Avoid_: App package, cloned form, global binding

**Configuration Drift**:
A reviewed difference between a Sidecar Configuration and current live Model-driven App metadata; drift never authorizes an automatic live mutation.
_Avoid_: Sync error, failed deployment

**Health Validation**:
A read-only assessment that verifies configuration uniqueness, target bindings, delegated identity settings, and existing-agent readiness.
_Avoid_: Deployment, repair, reconciliation

**Last Known-Good State**:
The verified pre-change state used to automatically roll back a failed sidecar lifecycle operation.
_Avoid_: Version history, audit log, backup solution

## Organization

**Employee**:
An internal worker represented by the Dataverse `systemuser` table and synchronized from Microsoft Entra ID.
_Avoid_: Worker record, custom employee, HR user

**Manager**:
An Employee who supervises another Employee through the Dataverse `systemuser.parentsystemuserid` relationship.
_Avoid_: Supervisor record, custom reporting line

**Position**:
An organizational role represented by the Dataverse `position` table; Positions may form a hierarchy.
_Avoid_: Job record, custom role

**Department**:
An organizational unit represented by the Dataverse `businessunit` table; Departments may form a hierarchy.
_Avoid_: Division record, custom department

## Time Off

**Time Off Type**:
An organization-defined category of leave with a default annual allowance.
_Avoid_: Leave category, absence type

**Time Off Balance**:
An Employee's allocated, pending, and used hours for one Time Off Type and calendar year.
_Avoid_: Leave bank, PTO bucket

**Time Off Request**:
An Employee's request to take a specified number of hours for a Time Off Type, approved by the Employee's Manager.
_Avoid_: Leave application, absence request

## Expenses

**Expense Report**:
An Employee's reimbursement submission containing one or more Expense Lines and approved by the Employee's Manager.
_Avoid_: Claim, reimbursement request

**Expense Line**:
A single dated expense within an Expense Report, with an amount, category, merchant, and one receipt file.
_Avoid_: Cost item, receipt record

## Benefits

**Benefit Plan**:
An organization-offered benefit with provider, category, coverage dates, and contribution amounts.
_Avoid_: Benefit package, program

**Benefit Enrollment**:
An Employee's selection of a Benefit Plan for a coverage period; it does not require approval.
_Avoid_: Benefit election, plan membership

## Agent Experience

**HR Management App Guide**:
The HR Management app's Agent Sidecar, connected to the existing HR Mgmt Classic Copilot Studio agent and supplied only the approved minimal page context.
_Avoid_: HR Copilot Side Pane, HR chatbot

**List Analysis**:
Analysis or processing requested while viewing a table list, explicitly scoped by the user to either every record matching the Current View or all accessible records in the table.
_Avoid_: Automatic grid context, background list processing
