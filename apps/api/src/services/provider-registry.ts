import * as googleOAuth from '@desk/connectors/google/oauth';
import * as microsoftOAuth from '@desk/connectors/microsoft/oauth';

export const providerRegistry = {
  google: {
    oauth: googleOAuth,
  },
  microsoft: {
    oauth: microsoftOAuth,
  },
};
