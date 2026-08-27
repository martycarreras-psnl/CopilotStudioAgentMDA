import { Button, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  CheckmarkCircleFilled,
  DismissCircleFilled,
} from '@fluentui/react-icons';
import type { SidecarProgress } from '@/types/sidecar-admin-models';
import type { OperationLogEntry } from '@/hooks/useOperationReport';

const phaseLabels: Record<string, string> = {
  forms: 'Updating forms',
  publish: 'Publishing form changes',
  readback: 'Verifying deployed forms',
  finalize: 'Finalizing configuration',
  cleanup: 'Cleaning up',
  rollback: 'Rolling back',
  result: 'Completed',
};

const useStyles = makeStyles({
  banner: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalL, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorBrandStroke1}` },
  headline: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground2 },
  warn: { color: tokens.colorPaletteMarigoldForeground2 },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  completed: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalXS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  completedRow: {
    display: 'grid',
    gridTemplateColumns: '20px 1fr',
    alignItems: 'start',
    gap: tokens.spacingHorizontalS,
  },
  success: { color: tokens.colorPaletteGreenForeground1, marginTop: '2px' },
  error: { color: tokens.colorPaletteRedForeground1, marginTop: '2px' },
});

interface OperationProgressProps {
  active: boolean;
  progress?: SidecarProgress;
  entries?: OperationLogEntry[];
  errorCount: number;
  downloadable: boolean;
  onDownload: () => void;
  activeNote?: string;
  idleNote?: string;
}

export function OperationProgress({
  active,
  progress,
  entries = [],
  errorCount,
  downloadable,
  onDownload,
  activeNote,
  idleNote,
}: OperationProgressProps) {
  const styles = useStyles();
  if (!active && !downloadable) return null;

  const total = progress?.total ?? 0;
  const value = active && progress && total > 0 ? Math.min(progress.current / total, 1) : undefined;
  const phase = progress ? (phaseLabels[progress.phase] ?? progress.phase) : undefined;
  const progressStarts = new Map<string, number>();
  const accomplishments: OperationLogEntry[] = [];
  const accomplishmentIndexes = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== 'progress') {
      accomplishments.push(entry);
      continue;
    }
    const key = `${entry.phase}:${entry.label}`;
    const start = progressStarts.get(key);
    if (start === undefined) {
      progressStarts.set(key, entry.current);
      continue;
    }
    if (entry.current <= start) continue;
    const existingIndex = accomplishmentIndexes.get(key);
    if (existingIndex === undefined) {
      accomplishmentIndexes.set(key, accomplishments.length);
      accomplishments.push({ ...entry, status: 'success' });
    } else {
      accomplishments[existingIndex] = { ...entry, status: 'success' };
    }
  }
  const visibleEntries = accomplishments.slice(-6);

  return (
    <div className={styles.banner} role="status" aria-live="assertive">
      <div className={styles.headline}>
        <Text weight="semibold">{active ? (phase ?? 'Working…') : 'Operation finished'}</Text>
        {downloadable && (
          <Button size="small" appearance="secondary" icon={<ArrowDownloadRegular />} onClick={onDownload}>
            Download report{errorCount > 0 ? ` (${errorCount} issue${errorCount === 1 ? '' : 's'})` : ''}
          </Button>
        )}
      </div>
      {active && (
        <>
          <ProgressBar value={value} thickness="large" />
          {progress && total > 0 && (
            <Text size={200} className={styles.muted}>
              {progress.phase === 'forms' ? `Form ${Math.min(progress.current + (progress.current < total ? 1 : 0), total)} of ${total}` : `${progress.current} of ${total}`} — {progress.label}
            </Text>
          )}
          {activeNote && <Text size={200} className={styles.muted}>{activeNote}</Text>}
        </>
      )}
      {!active && idleNote && <Text size={200} className={styles.muted}>{idleNote}</Text>}
      {errorCount > 0 && <Text size={200} className={styles.warn}>{errorCount} issue{errorCount === 1 ? '' : 's'} recorded — download the report for details.</Text>}
      {visibleEntries.length > 0 && (
        <div className={styles.completed} aria-label="Operation accomplishments">
          <Text size={200} weight="semibold">Progress confirmed</Text>
          {visibleEntries.map((entry, index) => (
            <div className={styles.completedRow} key={`${entry.time}-${index}`}>
              {entry.status === 'error'
                ? <DismissCircleFilled className={styles.error} aria-label="Failed" />
                : <CheckmarkCircleFilled className={styles.success} aria-label="Completed" />}
              <Text size={200}>{entry.label}</Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
