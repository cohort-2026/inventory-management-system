
import {
  hashPassword,
  verifyPassword,
} from './passwordService';

async function main(): Promise<void> {
  const password = 'TestPassword-2026!';

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  const tests = {
    correctPassword: await verifyPassword(
      firstHash,
      password,
    ),
    wrongPasswordRejected: !await verifyPassword(
      firstHash,
      'WrongPassword-2026!',
    ),
    uniqueSalt: firstHash !== secondHash,
    algorithmIsArgon2id: firstHash.startsWith('$argon2id$'),
  };

  let failures = 0;

  for (const [testName, passed] of Object.entries(tests)) {
    console.log(`${testName}: ${passed ? 'PASS' : 'FAIL'}`);

    if (!passed) {
      failures += 1;
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    'Password test failed:',
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});
