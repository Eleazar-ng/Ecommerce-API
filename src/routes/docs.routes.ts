import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolved relative to this file's own location (not process.cwd()) so it works
// identically whether run via `tsx src/server.ts` (this file lives at src/routes/) or the
// compiled `node dist/server.js` (this file lives at dist/routes/) — both are exactly two
// directories below the project root, where docs/openapi.yaml actually lives. Note: in a
// real deployment, docs/openapi.yaml must be copied alongside dist/, since it's a static
// asset TypeScript's build step doesn't know to include.
const openapiPath = path.join(__dirname, '../../docs/openapi.yaml');
const openapiDocument = yaml.load(readFileSync(openapiPath, 'utf8')) as Record<string, unknown>;

const router = Router();

// Public, no auth — API documentation should be freely browsable, same as the brief's own
// suggestion to explore this API via Postman (this spec is directly importable there too).
router.use('/', swaggerUi.serve, swaggerUi.setup(openapiDocument));

export default router;