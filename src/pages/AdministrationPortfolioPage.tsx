import { useNavigate } from 'react-router-dom';
import { PortfolioDashboard } from '@/components/PortfolioDashboard/PortfolioDashboard';
import { useAdminAccess, useSidecarConfigurations } from '@/hooks/useSidecarAdministration';

export function AdministrationPortfolioPage() {
  const navigate = useNavigate();
  const access = useAdminAccess();
  const configurations = useSidecarConfigurations();
  return (
    <PortfolioDashboard
      configurations={configurations.data}
      dataverseOrgUrl={access.data?.dataverseOrgUrl}
      loading={configurations.isLoading}
      error={configurations.error instanceof Error ? configurations.error.message : undefined}
      onCreate={() => navigate('/new')}
      onOpen={(id) => navigate(`/sidecars/${id}`)}
    />
  );
}
