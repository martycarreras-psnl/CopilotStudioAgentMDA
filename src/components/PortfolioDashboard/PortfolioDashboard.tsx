import {
  Badge,
  Button,
  Card,
  CardFooter,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Text,
  Title1,
  Title2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowRightRegular,
  CheckmarkCircleFilled,
  CheckmarkCircleRegular,
  DismissCircleFilled,
  GridRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { HealthBadge, LifecycleBadge } from '@/components/SidecarStatusBadge/SidecarStatusBadge';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';
import type { SidecarConfiguration } from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
    paddingBlock: tokens.spacingVerticalXXL,
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, .6fr)',
    gap: tokens.spacingHorizontalXXL,
    alignItems: 'stretch',
    padding: tokens.spacingHorizontalXXL,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundImage: `linear-gradient(135deg, ${tokens.colorBrandBackground2}, ${tokens.colorNeutralBackground1} 68%)`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow8,
    '@media (max-width: 800px)': { gridTemplateColumns: '1fr' },
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    maxWidth: '760px',
  },
  eyebrow: {
    color: tokens.colorBrandForeground1,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  subtitle: { color: tokens.colorNeutralForeground2 },
  heroAction: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  heroActionCopy: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  createIcon: {
    display: 'grid',
    placeItems: 'center',
    width: '48px',
    height: '48px',
    borderRadius: tokens.borderRadiusCircular,
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalM,
    '@media (max-width: 600px)': { gridTemplateColumns: '1fr' },
  },
  metric: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  metricIcon: {
    display: 'grid',
    placeItems: 'center',
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorBrandForeground1,
  },
  metricText: { display: 'flex', flexDirection: 'column' },
  metricValue: { fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalM,
  },
  sectionTitle: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: tokens.spacingHorizontalL },
  card: {
    minHeight: '286px',
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow4,
    ':hover': {
      boxShadow: tokens.shadow16,
      border: `1px solid ${tokens.colorBrandStroke1}`,
    },
  },
  cardIdentity: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minHeight: '64px',
  },
  cardTitle: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0 },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, flex: 1 },
  badges: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  successSummary: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS },
  successIcon: { color: tokens.colorPaletteGreenForeground1, flexShrink: 0, marginTop: '2px' },
  warningIcon: { color: tokens.colorPaletteMarigoldForeground2, flexShrink: 0, marginTop: '2px' },
  errorIcon: { color: tokens.colorPaletteRedForeground1, flexShrink: 0, marginTop: '2px' },
  facts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM },
  fact: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  label: { color: tokens.colorNeutralForeground3 },
  empty: {
    padding: tokens.spacingHorizontalXXL,
    textAlign: 'center',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
  },
  skeleton: { height: '260px' },
});

interface PortfolioDashboardProps {
  configurations?: SidecarConfiguration[];
  dataverseOrgUrl?: string;
  loading: boolean;
  error?: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
}

export function PortfolioDashboard({
  configurations = [],
  dataverseOrgUrl,
  loading,
  error,
  onCreate,
  onOpen,
}: PortfolioDashboardProps) {
  const styles = useStyles();
  const healthy = configurations.filter((item) => item.healthState === 'healthy').length;
  const attention = configurations.filter((item) => item.healthState === 'warning' || item.healthState === 'critical').length;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.intro}>
          <Text size={200} weight="semibold" className={styles.eyebrow}>Agent Sidecar workspace</Text>
          <Title1 as="h1">Sidecar dashboard</Title1>
          <Text size={500} className={styles.subtitle}>
            Give every model-driven app a focused Copilot Studio assistant, then manage its health and placement from one clear workspace.
          </Text>
          <div><Badge appearance="tint" color="brand">System Administrator</Badge></div>
        </div>
        <div className={styles.heroAction}>
          <div className={styles.createIcon}><AddRegular fontSize={24} /></div>
          <div className={styles.heroActionCopy}>
            <Title3>Activate another assistant</Title3>
            <Text className={styles.subtitle}>A guided setup will discover the app, forms, and published agents for you.</Text>
          </div>
          <Button appearance="primary" size="large" icon={<AddRegular />} onClick={onCreate}>Create sidecar</Button>
        </div>
      </section>

      {error && <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Dashboard unavailable</MessageBarTitle>{error}</MessageBarBody></MessageBar>}

      <section className={styles.metrics} aria-label="Dashboard summary">
        <Card className={styles.metric}><span className={styles.metricIcon}><GridRegular /></span><span className={styles.metricText}><Text className={styles.label}>Configured</Text><Text className={styles.metricValue}>{configurations.length}</Text></span></Card>
        <Card className={styles.metric}><span className={styles.metricIcon}><CheckmarkCircleRegular /></span><span className={styles.metricText}><Text className={styles.label}>Healthy</Text><Text className={styles.metricValue}>{healthy}</Text></span></Card>
        <Card className={styles.metric}><span className={styles.metricIcon}><WarningRegular /></span><span className={styles.metricText}><Text className={styles.label}>Needs attention</Text><Text className={styles.metricValue}>{attention}</Text></span></Card>
      </section>

      {loading ? (
        <div className={styles.grid}>{[1, 2, 3].map((id) => <Skeleton key={id} className={styles.skeleton}><SkeletonItem /></Skeleton>)}</div>
      ) : configurations.length === 0 ? (
        <Card className={styles.empty}>
          <span className={styles.createIcon}><AddRegular fontSize={24} /></span>
          <Title3>No sidecars configured</Title3>
          <Text>Start a guided setup to connect a model-driven app with an existing published Copilot Studio agent.</Text>
          <Button appearance="primary" onClick={onCreate}>Create sidecar</Button>
        </Card>
      ) : (
        <section aria-label="Configured sidecars">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}><Title2 as="h2">Your sidecars</Title2><Text className={styles.subtitle}>Recognize each assistant by the same icon people see in the target app.</Text></div>
            <Text size={200} className={styles.label}>{configurations.length} configured</Text>
          </div>
          <div className={styles.grid}>
            {configurations.map((configuration) => (
              <Card key={configuration.id} className={styles.card}>
                <div className={styles.cardIdentity}>
                  <SidecarIcon
                    label={configuration.name}
                    content={configuration.iconContent}
                    webResourceName={configuration.iconWebResourceName}
                    dataverseOrgUrl={dataverseOrgUrl}
                    size={52}
                  />
                  <div className={styles.cardTitle}>
                    <Title3>{configuration.name}</Title3>
                    <Text>{configuration.appDisplayName}</Text>
                  </div>
                </div>
                <Divider />
                <div className={styles.body}>
                  <div className={styles.badges}><HealthBadge state={configuration.healthState} /><LifecycleBadge state={configuration.lifecycleState} /></div>
                  <div className={styles.successSummary}>
                    {configuration.healthState === 'critical'
                      ? <DismissCircleFilled className={styles.errorIcon} aria-label="Critical" />
                      : configuration.healthState === 'warning'
                        ? <WarningRegular className={styles.warningIcon} aria-label="Warning" />
                        : <CheckmarkCircleFilled className={styles.successIcon} aria-label="Healthy" />}
                    <Text>{configuration.lastOperationSummary}</Text>
                  </div>
                  <div className={styles.facts}>
                    <div className={styles.fact}><Text size={200} className={styles.label}>Published agent</Text><Text weight="semibold">{configuration.agentDisplayName}</Text></div>
                    <div className={styles.fact}><Text size={200} className={styles.label}>Placement</Text><Text weight="semibold">{configuration.tables.length} table{configuration.tables.length === 1 ? '' : 's'}</Text></div>
                  </div>
                  {configuration.iconDisplayIssue && (
                    <Text size={200} className={styles.warningIcon}>Configured icon unavailable; showing the packaged fallback.</Text>
                  )}
                </div>
                <CardFooter><Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => onOpen(configuration.id)}>Manage sidecar</Button></CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
