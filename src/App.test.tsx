import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../tests/setup/test-utils';
import { App } from './App';

describe('Agent Sidecar Administration', () => {
  it('renders the administrator portfolio and health summary', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sidecar portfolio' })).toBeTruthy();
    expect(await screen.findByText('HR Management App Guide')).toBeTruthy();
    expect(screen.getByText('Field Operations Assistant')).toBeTruthy();
    expect(screen.getByText('Finance Operations Guide')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Portfolio summary' })).toBeTruthy();
  });

  it('opens the create-sidecar wizard', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create sidecar' }));
    expect(await screen.findByRole('heading', { name: 'Create a sidecar' })).toBeTruthy();
    expect(screen.getByText('1. Application')).toBeTruthy();
    expect(await screen.findByText('Sales Workspace')).toBeTruthy();
  });

  it('marks the chosen Model-driven App as selected', async () => {
    render(<App />, { initialRoute: '/new' });
    const salesApp = await screen.findByRole('button', { name: /Sales Workspace/ });
    expect(salesApp.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(salesApp);
    expect(salesApp.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Selected')).toBeTruthy();
  });

  it('shows the exact redirect URI and blocks invalid identity GUIDs', async () => {
    render(<App />, { initialRoute: '/new' });
    fireEvent.click(await screen.findByRole('button', { name: /Sales Workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('combobox', { name: /Published Copilot Studio agent/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Field Guide/ }));
    expect((await screen.findAllByText(/Field Guide/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/standard harness/)).toBeTruthy();
    expect(screen.getByText('Sidecar icon')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Tenant ID/ }), { target: { value: 'not-a-guid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Tenant ID must be a valid GUID.')).toBeTruthy();
  });

  it('opens a sidecar and automatically validates health', async () => {
    render(<App />);
    const manageButtons = await screen.findAllByRole('button', { name: 'Manage sidecar' });
    fireEvent.click(manageButtons[0]);
    expect(await screen.findByRole('heading', { name: 'HR Management App Guide' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Health validation' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Last validated:/)).toBeTruthy());
  });

  it('requires explicit approval before reconciling drift', async () => {
    render(<App />, { initialRoute: '/sidecars/sidecar-field-operations' });
    expect(await screen.findByRole('heading', { name: 'Drift review' })).toBeTruthy();
    expect(screen.getByText('Account was added to the target app')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve reconciliation' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Drift review' })).toBeNull());
    expect(screen.getByText('Administrator-approved reconciliation completed and read-back passed.')).toBeTruthy();
  });

  it('supports disable and re-enable without deleting configuration', async () => {
    render(<App />, { initialRoute: '/sidecars/sidecar-hr-management' });
    const disable = await screen.findByRole('button', { name: 'Disable' });
    fireEvent.click(disable);
    const enable = await screen.findByRole('button', { name: 'Enable' });
    fireEvent.click(enable);
    expect(await screen.findByRole('button', { name: 'Disable' })).toBeTruthy();
  });

  it('edits tables and icon in place while preserving immutable identity', async () => {
    render(<App />, { initialRoute: '/sidecars/sidecar-hr-management' });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit tables & icon' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/app, agent connection, pane identity, Entra identity/)).toBeTruthy();
    expect((await screen.findByRole('radio', { name: 'Keep the current icon' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/\d+ forms? selected/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Tables, forms, and icon updated in place.')).toBeTruthy();
    expect(screen.getByText('cr0b1_HRMgmtClassic')).toBeTruthy();
  });
});
