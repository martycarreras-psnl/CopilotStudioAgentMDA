import { render, screen } from '../../../tests/setup/test-utils';
import { OperationProgress } from './OperationProgress';

describe('OperationProgress', () => {
  it('uses checkmarks to confirm completed operation work', () => {
    render(
      <OperationProgress
        active={false}
        entries={[
          {
            time: '2026-08-27T10:59:59.000Z',
            phase: 'forms',
            current: 0,
            total: 1,
            label: 'Contact — Information',
            status: 'progress',
          },
          {
            time: '2026-08-27T11:00:00.000Z',
            phase: 'forms',
            current: 1,
            total: 1,
            label: 'Contact — Information',
            status: 'progress',
          },
          {
            time: '2026-08-27T11:00:01.000Z',
            phase: 'result',
            current: 0,
            total: 0,
            label: 'Deployment completed and read-back passed.',
            status: 'success',
          },
        ]}
        errorCount={0}
        downloadable
        onDownload={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Operation accomplishments')).toBeTruthy();
    expect(screen.getAllByLabelText('Completed')).toHaveLength(2);
    expect(screen.getByText('Contact — Information')).toBeTruthy();
    expect(screen.getByText('Deployment completed and read-back passed.')).toBeTruthy();
  });

  it('does not mark started or failed work as completed', () => {
    render(
      <OperationProgress
        active={false}
        entries={[
          {
            time: '2026-08-27T11:00:00.000Z',
            phase: 'publish',
            current: 1,
            total: 1,
            label: 'Publishing form changes',
            status: 'progress',
          },
          {
            time: '2026-08-27T11:00:01.000Z',
            phase: 'result',
            current: 0,
            total: 0,
            label: 'Publishing failed.',
            status: 'error',
          },
        ]}
        errorCount={1}
        downloadable
        onDownload={() => undefined}
      />,
    );

    expect(screen.queryByText('Publishing form changes')).toBeNull();
    expect(screen.getByLabelText('Failed')).toBeTruthy();
    expect(screen.queryByLabelText('Completed')).toBeNull();
  });
});
