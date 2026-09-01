import { AuditService } from './audit.service';

async function runAuditTests() {
  console.log('--- RUNNING PHASE 4 AUDIT TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  AuditService.clearEvents();

  // TEST 1: Record and retrieve events
  try {
    AuditService.recordEvent('PROPOSAL_CREATED', 'prop_100', 'merchant_aquamart', 'bottle_001', { fee: 5000 });
    AuditService.recordEvent('PROPOSAL_APPROVED', 'prop_100', 'merchant_aquamart', 'bottle_001', { approvedBy: 'human' });

    const propEvents = AuditService.getEventsForProposal('prop_100');
    assert(
      propEvents.length === 2 &&
        propEvents[0].eventType === 'PROPOSAL_CREATED' &&
        propEvents[1].eventType === 'PROPOSAL_APPROVED',
      'Test 1: Audit events recorded and retrieved for proposal',
      JSON.stringify(propEvents)
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // TEST 2: Preserves event ordering and timestamping
  try {
    const allEvents = AuditService.getAllEvents();
    const isOrdered = new Date(allEvents[0].timestamp) <= new Date(allEvents[1].timestamp);
    assert(
      allEvents.length === 2 && isOrdered && allEvents[0].eventId !== allEvents[1].eventId,
      'Test 2: Event ordering, unique IDs, and timestamps preserved',
      JSON.stringify(allEvents)
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests();
