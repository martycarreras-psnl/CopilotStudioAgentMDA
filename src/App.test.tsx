import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../tests/setup/test-utils';
import { App } from './App';

describe('Agent Sidecar Administration', () => {
  it('renders the administrator portfolio and health summary', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sidecar dashboard' })).toBeTruthy();
    expect(await screen.findByText('HR Management App Guide')).toBeTruthy();
    expect(screen.getByText('Field Operations Assistant')).toBeTruthy();
    expect(screen.getByText('Finance Operations Guide')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).toBeTruthy();
    expect(screen.getByAltText('HR Management App Guide sidecar icon')).toBeTruthy();
  });

  it('opens the create-sidecar wizard', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create sidecar' }));
    expect(await screen.findByRole('heading', { name: 'Create a sidecar' })).toBeTruthy();
    expect(screen.getAllByText('Application').length).toBeGreaterThan(0);
    expect(screen.getByText('Choose the model-driven app')).toBeTruthy();
    expect(await screen.findByText('Sales Workspace')).toBeTruthy();
  });

  it('marks the chosen Model-driven App as selected', async () => {
    render(<App />, { initialRoute: '/new' });
    const salesApp = await screen.findByRole('button', { name: 'Select Sales Workspace' });
    expect(salesApp.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(salesApp);
    expect(salesApp.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Selected')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Available model-driven apps' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Current configuration choices' })).toBeTruthy();
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

    const tenantId = screen.getByRole('textbox', { name: /Tenant ID/ }) as HTMLInputElement;
    expect(tenantId.value).toBe('d92190b9-98e7-46da-8b11-580e06c7d15d');
    expect(screen.getByText('Detected')).toBeTruthy();
    fireEvent.change(tenantId, { target: { value: 'not-a-guid' } });
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
    const disable = await screen.findByRole('button', { name: 'Disable sidecar' });
    fireEvent.click(disable);
    const enable = await screen.findByRole('button', { name: 'Enable sidecar' });
    fireEvent.click(enable);
    expect(await screen.findByRole('button', { name: 'Disable sidecar' })).toBeTruthy();
  });

  it('edits tables and icon in place while preserving immutable identity', async () => {
    render(<App />, { initialRoute: '/sidecars/sidecar-hr-management' });
    expect((await screen.findAllByText('Information')).length).toBeGreaterThan(0);
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Validate health' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change icon' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit placement' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Edit sidecar settings' })).toBeTruthy();
    expect(screen.getByText(/Sidecar identity and conversation history stay unchanged/)).toBeTruthy();
    expect((await screen.findByRole('tab', { name: /Placement/ })).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Available tables' })).toBeTruthy();
    expect(screen.getByRole('region', { name: /forms$/ })).toBeTruthy();
    expect(screen.queryByText('Customer profile cases')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Keep the current icon' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Position/ }));
    expect(screen.getByRole('region', { name: 'Position forms' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(screen.getByText('Sidecar icon')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Keep the current icon' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'Applying your changes' })).toBeTruthy();
    expect(screen.getByText(/safely updates and verifies the configuration/)).toBeTruthy();
    expect(screen.getByText('Update placement')).toBeTruthy();
    expect(screen.getByText('Publish changes')).toBeTruthy();
    expect(screen.getByText('Verify the result')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saving changes…' })).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findAllByText('Tables, forms, and icon updated in place.')).length).toBeGreaterThan(0);
    expect(screen.getByText('cr0b1_HRMgmtClassic')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit placement' }));
    expect((await screen.findByRole('tab', { name: /Placement/ })).getAttribute('aria-selected')).toBe('true');
  });

  it('opens appearance directly from the contextual action', async () => {
    render(<App />, { initialRoute: '/sidecars/sidecar-hr-management' });
    fireEvent.click(await screen.findByRole('button', { name: 'Change icon' }));

    expect(await screen.findByRole('heading', { name: 'Edit sidecar settings' })).toBeTruthy();
    expect((await screen.findByRole('tab', { name: 'Appearance' })).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('CURRENT ICON')).toBeTruthy();
  });
});
