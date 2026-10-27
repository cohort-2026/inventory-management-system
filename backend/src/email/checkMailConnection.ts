
import {
  verifyMailConnection,
  closeMailConnection,
} from './mailService';

async function main(): Promise<void> {
  try {
    await verifyMailConnection();

    console.log('SMTP connection: PASS');
    console.log('SMTP authentication: PASS');
  } catch (error) {
    console.error('SMTP connection: FAIL');

    if (error instanceof Error) {
      console.error('Error:', error.message);
    }

    process.exitCode = 1;
  } finally {
    closeMailConnection();
  }
}

void main();
