import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Text,
  Title1,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, ArrowRightRegular, BotRegular, CheckmarkCircleRegular, WarningRegular } from '@fluentui/react-icons';
import { HealthBadge, LifecycleBadge } from '@/components/SidecarStatusBadge/SidecarStatusBadge';
import type { SidecarConfiguration } from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXL, paddingBlock: tokens.spacingVerticalXXL },
  hero: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: tokens.spacingHorizontalXL, '@media (max-width: 720px)': { alignItems: 'stretch', flexDirection: 'column' } },
  intro: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, maxWidth: '720px' },
  subtitle: { color: tokens.colorNeutralForeground2 },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: tokens.spacingHorizontalM, '@media (max-width: 600px)': { gridTemplateColumns: '1fr' } },
  metric: { padding: tokens.spacingHorizontalL, gap: tokens.spacingVerticalXS },
  metricValue: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightSemibold },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: tokens.spacingHorizontalL },
  card: { minHeight: '260px', padding: tokens.spacingHorizontalL },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, flex: 1 },
  badges: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  facts: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM },
  fact: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  label: { color: tokens.colorNeutralForeground3 },
  empty: { padding: tokens.spacingHorizontalXXL, textAlign: 'center', gap: tokens.spacingVerticalM },
  skeleton: { height: '260px' },
});

interface PortfolioDashboardProps {
  configurations?: SidecarConfiguration[];
  loading: boolean;
  error?: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
}

export function PortfolioDashboard({ configurations = [], loading, error, onCreate, onOpen }: PortfolioDashboardProps) {
  const styles = useStyles();
  const healthy = configurations.filter((item) => item.healthState === 'healthy').length;
  const attention = configurations.filter((item) => item.healthState === 'warning' || item.healthState === 'critical').length;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.intro}>
          <Title1 as="h1">Sidecar portfolio</Title1>
          <Text size={400} className={styles.subtitle}>
            Configure, validate, reconcile, disable, and safely remove independently identified Copilot Studio sidecars.
          </Text>
        </div>
        <Button appearance="primary" size="large" icon={<AddRegular />} onClick={onCreate}>Create sidecar</Button>
      </section>

      {error && <MessageBar intent="error"><MessageBarBody><MessageBarTitle>Portfolio unavailable</MessageBarTitle>{error}</MessageBarBody></MessageBar>}

      <section className={styles.metrics} aria-label="Portfolio summary">
        <Card className={styles.metric}><Text className={styles.label}>Configured sidecars</Text><Text className={styles.metricValue}>{configurations.length}</Text></Card>
        <Card className={styles.metric}><Text className={styles.label}>Healthy</Text><Text className={styles.metricValue}><CheckmarkCircleRegular /> {healthy}</Text></Card>
        <Card className={styles.metric}><Text className={styles.label}>Needs attention</Text><Text className={styles.metricValue}><WarningRegular /> {attention}</Text></Card>
      </section>

      {loading ? (
        <div className={styles.grid}>{[1, 2, 3].map((id) => <Skeleton key={id} className={styles.skeleton}><SkeletonItem /></Skeleton>)}</div>
      ) : configurations.length === 0 ? (
        <Card className={styles.empty}>
          <BotRegular fontSize={40} />
          <Title3>No sidecars configured</Title3>
          <Text>Create the first binding for a Model-driven App and an existing Copilot Studio agent.</Text>
          <Button appearance="primary" onClick={onCreate}>Create sidecar</Button>
        </Card>
      ) : (
        <section className={styles.grid} aria-label="Configured sidecars">
          {configurations.map((configuration) => (
            <Card key={configuration.id} className={styles.card}>
              <CardHeader
                image={<BotRegular fontSize={28} />}
                header={<Title3>{configuration.name}</Title3>}
                description={<Text>{configuration.appDisplayName}</Text>}
              />
              <div className={styles.body}>
                <div className={styles.badges}><HealthBadge state={configuration.healthState} /><LifecycleBadge state={configuration.lifecycleState} /></div>
                <Text>{configuration.lastOperationSummary}</Text>
                <div className={styles.facts}>
                  <div className={styles.fact}><Text size={200} className={styles.label}>Agent</Text><Text weight="semibold">{configuration.agentDisplayName}</Text></div>
                  <div className={styles.fact}><Text size={200} className={styles.label}>Tables</Text><Text weight="semibold">{configuration.tables.length} · main forms</Text></div>
                </div>
              </div>
              <CardFooter><Button appearance="subtle" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => onOpen(configuration.id)}>Manage sidecar</Button></CardFooter>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
