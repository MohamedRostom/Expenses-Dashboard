import { Hono } from 'hono';
import {
  SetCaptureMappingRequest,
  type ListCaptureTokensResponseT,
  type RotateCaptureTokenResponseT,
  type CaptureMappingResponseT,
} from '@desk/contracts';
import type { AppVariables } from '../app.js';
import { requireAuth } from '../lib/require-auth.js';
import type { CaptureService } from '../services/capture.js';

/** GET /capture/tokens, POST /capture/tokens/:label/rotate, GET/PUT /capture/mapping. */
export function createCaptureRoutes(captureService: CaptureService, appOrigin: string) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get('/capture/tokens', async (c) => {
    const user = requireAuth(c);
    const tokens = await captureService.listTokens(user.id);
    const body: ListCaptureTokensResponseT = { tokens };
    return c.json(body);
  });

  app.post('/capture/tokens/:label/rotate', async (c) => {
    const user = requireAuth(c);
    const label = c.req.param('label');
    const { token, secret } = await captureService.rotateToken(user.id, label);
    const body: RotateCaptureTokenResponseT = {
      token,
      secret,
      // appOrigin, not c.req.url's origin — behind a reverse proxy (Fly's edge, a preview app)
      // that origin can be an internal hostname/port the phone automation could never reach.
      url: `${appOrigin}/hooks/generic/${secret}`,
    };
    return c.json(body);
  });

  app.get('/capture/mapping', async (c) => {
    const user = requireAuth(c);
    const { mappings, unmappedLabels } = await captureService.getMapping(user.id);
    const body: CaptureMappingResponseT = { mappings, unmappedLabels };
    return c.json(body);
  });

  app.put('/capture/mapping', async (c) => {
    const user = requireAuth(c);
    const input = SetCaptureMappingRequest.parse(await c.req.json());
    await captureService.setMapping(user.id, input.mappings);
    const { mappings, unmappedLabels } = await captureService.getMapping(user.id);
    const body: CaptureMappingResponseT = { mappings, unmappedLabels };
    return c.json(body);
  });

  return app;
}
