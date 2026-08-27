import { useState } from 'react';
import {
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  normalizeUploadedSidecarIcon,
  sidecarIconDataUrl,
} from '@/lib/sidecar-icon';
import { SidecarIcon } from '@/components/SidecarIcon/SidecarIcon';
import type {
  SidecarIconContent,
  SidecarIconSelection,
  SidecarIconSource,
} from '@/types/sidecar-admin-models';

const useStyles = makeStyles({
  layout: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  option: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  preview: {
    width: '48px',
    height: '48px',
    borderRadius: tokens.borderRadiusCircular,
    objectFit: 'cover',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  guidance: { color: tokens.colorNeutralForeground2 },
});

interface SidecarIconPickerProps {
  agentIcon?: SidecarIconContent;
  value: SidecarIconSelection;
  onChange: (value: SidecarIconSelection) => void;
  onError: (message?: string) => void;
}

export function SidecarIconPicker({
  agentIcon,
  value,
  onChange,
  onError,
}: SidecarIconPickerProps) {
  const styles = useStyles();
  const [uploaded, setUploaded] = useState<SidecarIconContent>();
  const selectedContent = value.source === 'agent'
    ? agentIcon
    : value.source === 'uploaded'
      ? uploaded
      : undefined;

  const selectSource = (source: SidecarIconSource) => {
    if (source === 'agent' && agentIcon) onChange({ source, content: agentIcon });
    else if (source === 'uploaded' && uploaded) onChange({ source, content: uploaded });
    else onChange({ source: 'default' });
    onError(undefined);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const content = await normalizeUploadedSidecarIcon(file);
      setUploaded(content);
      onChange({ source: 'uploaded', content });
      onError(undefined);
    } catch (error) {
      setUploaded(undefined);
      onChange({ source: 'default' });
      onError(error instanceof Error ? error.message : 'The icon could not be prepared.');
    }
  };

  return (
    <div className={styles.layout}>
      <RadioGroup
        value={value.source}
        onChange={(_, data) => selectSource(data.value as SidecarIconSource)}
      >
        <Radio
          value="agent"
          disabled={!agentIcon}
          label={agentIcon ? 'Use the Copilot Studio agent logo' : 'Copilot Studio agent logo is unavailable'}
        />
        <Radio value="uploaded" label="Upload a custom logo" />
        <Radio value="default" label="Use the default Agent Sidecar icon" />
      </RadioGroup>
      <input
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Upload sidecar logo"
        onChange={(event) => void upload(event.currentTarget.files?.[0])}
      />
      <Text size={200} className={styles.guidance}>
        PNG or JPEG, square recommended, 128×128 or 256×256 preferred, maximum
        512×512 and 256 KB. Transparent PNG works best. SVG uploads are not accepted.
      </Text>
      {selectedContent && (
        <div className={styles.option}>
          <img
            className={styles.preview}
            src={sidecarIconDataUrl(selectedContent)}
            alt="Selected sidecar icon preview"
          />
          <Text>{selectedContent.width}×{selectedContent.height} · {selectedContent.mimeType}</Text>
        </div>
      )}
      {value.source === 'default' && (
        <>
          <div className={styles.option}>
            <SidecarIcon label="Default Agent Sidecar" size={48} />
            <Text>Packaged Agent Sidecar icon</Text>
          </div>
          <MessageBar intent="info">
            <MessageBarBody>The packaged Agent Sidecar icon will be used.</MessageBarBody>
          </MessageBar>
        </>
      )}
    </div>
  );
}
