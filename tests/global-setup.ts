import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Deliberately NOT importing Vitest's own GlobalSetupContext type — its exact shape/export
// path has drifted across minor versions, and without a committed lockfile, `npm install`
// on a different machine can resolve a slightly different Vitest version than what this was
// built against. Since we only ever use `provide`, typing just that ourselves sidesteps the
// whole problem rather than chasing an exact version match.
interface MinimalGlobalSetupContext {
  provide: (key: string, value: unknown) => void;
}

// A single-node replica set, not a plain MongoMemoryServer — plain standalone in-memory
// Mongo doesn't support transactions, and webhook.service.ts's Stage 11 transactions need
// to actually run in tests, not be silently skipped/mocked around.
export default async function setup({ provide }: MinimalGlobalSetupContext) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  provide('mongoUri', replSet.getUri());

  // Runs once after every test file has finished, regardless of pass/fail.
  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}