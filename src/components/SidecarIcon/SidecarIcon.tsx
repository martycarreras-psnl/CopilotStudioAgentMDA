import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import defaultSidecarIcon from '../../../model-driven/webresources/maftagsc_/copilot/agentGuideLibrary.svg?url';
import { sidecarIconDataUrl } from '@/lib/sidecar-icon';
import type { SidecarIconContent } from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  image: {
    display: 'block',
    width: 'var(--sidecar-icon-size)',
    height: 'var(--sidecar-icon-size)',
    objectFit: 'cover',
    borderRadius: tokens.borderRadiusCircular,
    boxShadow: tokens.shadow4,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

interface SidecarIconProps {
  label: string;
  webResourceName?: string;
  dataverseOrgUrl?: string;
  content?: SidecarIconContent;
  size?: number;
  className?: string;
}

function webResourceUrl(
  webResourceName: string | undefined,
  dataverseOrgUrl: string | undefined,
): string | undefined {
  if (!webResourceName || !dataverseOrgUrl) return undefined;
  try {
    return new URL(`/WebResources/${webResourceName}`, dataverseOrgUrl).toString();
  } catch {
    return undefined;
  }
}

export function SidecarIcon({
  label,
  webResourceName,
  dataverseOrgUrl,
  content,
  size = 48,
  className,
}: SidecarIconProps) {
  const styles = useStyles();
  const configuredUrl = useMemo(
    () => content
      ? sidecarIconDataUrl(content)
      : webResourceUrl(webResourceName, dataverseOrgUrl),
    [content, dataverseOrgUrl, webResourceName],
  );
  const [source, setSource] = useState(configuredUrl ?? defaultSidecarIcon);

  useEffect(() => {
    setSource(configuredUrl ?? defaultSidecarIcon);
  }, [configuredUrl]);

  return (
    <img
      className={`${styles.image}${className ? ` ${className}` : ''}`}
      src={source}
      alt={`${label} sidecar icon`}
      style={{ '--sidecar-icon-size': `${size}px` } as CSSProperties}
      onError={() => setSource(defaultSidecarIcon)}
    />
  );
}
