import type { ReactNode } from 'react';
import { Button, Text, Title3, makeStyles, tokens } from '@fluentui/react-components';
import { AddRegular, HomeRegular, ShieldLockRegular } from '@fluentui/react-icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';

const useStyles = makeStyles({
  shell: { minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground2 },
  header: {
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    paddingInline: tokens.spacingHorizontalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    position: 'sticky',
    top: 0,
    zIndex: 10,
    '@media (max-width: 720px)': { height: 'auto', alignItems: 'flex-start', flexDirection: 'column', paddingBlock: tokens.spacingVerticalM },
  },
  brand: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  brandText: { display: 'flex', flexDirection: 'column' },
  nav: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  access: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    '@media (max-width: 720px)': { display: 'none' },
  },
  content: { maxWidth: '1240px', marginInline: 'auto', padding: tokens.spacingHorizontalXL, '@media (max-width: 720px)': { padding: tokens.spacingHorizontalM } },
});

export function AdminShell({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <SidecarIcon label="Agent Sidecar" size={32} />
          <div className={styles.brandText}>
            <Title3>Agent Sidecar</Title3>
            <Text size={200}>Administration</Text>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Administration navigation">
          <Button
            appearance={location.pathname === '/' ? 'secondary' : 'subtle'}
            icon={<HomeRegular />}
            onClick={() => navigate('/')}
          >
            Dashboard
          </Button>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => navigate('/new')}>
            New sidecar
          </Button>
        </nav>
        <div className={styles.access} title="Access is enforced by Power Platform security roles">
          <ShieldLockRegular />
          <Text size={200}>System Administrator</Text>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
