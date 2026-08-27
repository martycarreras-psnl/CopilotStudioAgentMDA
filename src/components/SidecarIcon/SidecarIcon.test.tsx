import { render, screen } from '../../../tests/setup/test-utils';
import { SidecarIcon } from './SidecarIcon';

describe('SidecarIcon', () => {
  it('uses the configured Dataverse web resource so the dashboard matches the pane', () => {
    render(
      <SidecarIcon
        label="Sales assistant"
        webResourceName="maftagsc_/sidecars/configuration/icon_0123456789abcdef.png"
        dataverseOrgUrl="https://example.crm.dynamics.com"
      />,
    );

    expect(screen.getByAltText('Sales assistant sidecar icon').getAttribute('src')).toBe(
      'https://example.crm.dynamics.com/WebResources/maftagsc_/sidecars/configuration/icon_0123456789abcdef.png',
    );
  });

  it('uses the packaged sidecar icon when no custom web resource exists', () => {
    render(<SidecarIcon label="Default assistant" />);

    expect(screen.getByAltText('Default assistant sidecar icon').getAttribute('src'))
      .toContain('agentGuideLibrary.svg');
  });

  it('uses retrieved Dataverse image content before the authenticated web-resource URL', () => {
    render(
      <SidecarIcon
        label="Configured assistant"
        content={{
          base64: 'aWNvbg==',
          mimeType: 'image/png',
          width: 128,
          height: 128,
          contentHash: 'hash',
        }}
        webResourceName="maftagsc_/sidecars/configuration/icon_hash.png"
        dataverseOrgUrl="https://example.crm.dynamics.com"
      />,
    );

    expect(screen.getByAltText('Configured assistant sidecar icon').getAttribute('src')).toBe(
      'data:image/png;base64,aWNvbg==',
    );
  });
});
