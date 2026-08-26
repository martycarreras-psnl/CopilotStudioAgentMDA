import { describe, expect, it } from 'vitest';
import { hasOtherEnabledFormOwner } from './shared-form-owner';

const FORM_ID = '11111111-2222-3333-4444-555555555555';
const FIRST_CONFIGURATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SECOND_CONFIGURATION_ID = '12345678-1234-1234-1234-123456789abc';

describe('shared form ownership', () => {
  it('keeps the shared dispatcher while another enabled configuration owns the form', () => {
    expect(hasOtherEnabledFormOwner(
      [
        {
          maftagsc_formid: FORM_ID,
          maftagsc_enabled: true,
          _maftagsc_sidecarconfiguration_value: FIRST_CONFIGURATION_ID,
        },
        {
          maftagsc_formid: FORM_ID,
          maftagsc_enabled: true,
          _maftagsc_sidecarconfiguration_value: SECOND_CONFIGURATION_ID,
        },
      ],
      new Set([FIRST_CONFIGURATION_ID, SECOND_CONFIGURATION_ID]),
      FORM_ID,
      FIRST_CONFIGURATION_ID,
    )).toBe(true);
  });

  it('releases the dispatcher when no other active owner remains', () => {
    expect(hasOtherEnabledFormOwner(
      [{
        maftagsc_formid: FORM_ID,
        maftagsc_enabled: true,
        _maftagsc_sidecarconfiguration_value: SECOND_CONFIGURATION_ID,
      }],
      new Set([FIRST_CONFIGURATION_ID]),
      FORM_ID,
      FIRST_CONFIGURATION_ID,
    )).toBe(false);
  });

  it('matches active owners by normalized configuration GUID identity', () => {
    expect(hasOtherEnabledFormOwner(
      [{
        maftagsc_formid: `{${FORM_ID.toUpperCase()}}`,
        maftagsc_enabled: true,
        _maftagsc_sidecarconfiguration_value: `{${SECOND_CONFIGURATION_ID.toUpperCase()}}`,
      }],
      new Set([`{${SECOND_CONFIGURATION_ID.toUpperCase()}}`]),
      FORM_ID,
      FIRST_CONFIGURATION_ID,
    )).toBe(true);
  });
});
