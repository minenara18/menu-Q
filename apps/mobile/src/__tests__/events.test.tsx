import { initialQueueState, reduceQueueEvent, type QueueEvent } from '../realtime/events';

const created: QueueEvent = {
  type: 'ticket:created',
  payload: {
    ticket: {
      id: 't1',
      ticketNumber: 'A-001',
      status: 'ORDERED' as never,
      etaMin: 6,
      etaMax: 10,
    } as never,
    subtickets: [
      {
        id: 's1',
        stationId: 'st1',
        station: { code: 'BAR' },
        status: 'ORDERED' as never,
      } as never,
    ],
  } as never,
};

describe('socket event reducer', () => {
  it('adds a ticket with its subtickets', () => {
    const state = reduceQueueEvent(initialQueueState, created);
    expect(state.order).toEqual(['t1']);
    expect(state.tickets['t1'].ticketNumber).toBe('A-001');
    expect(state.tickets['t1'].subtickets[0].status).toBe('ORDERED');
  });

  it('updates only the matching subticket', () => {
    let state = reduceQueueEvent(initialQueueState, created);
    state = reduceQueueEvent(state, {
      type: 'subticket:updated',
      payload: { subticketId: 's1', ticketId: 't1', status: 'READY' as never },
    } as never);
    expect(state.tickets['t1'].subtickets[0].status).toBe('READY');
  });

  it('applies ETA and ready events, then bumps version on queue updates', () => {
    let state = reduceQueueEvent(initialQueueState, created);
    state = reduceQueueEvent(state, {
      type: 'ticket:eta-updated',
      payload: { ticketId: 't1', ticketNumber: 'A-001', etaMin: 8, etaMax: 12 },
    });
    expect(state.tickets['t1'].etaMax).toBe(12);

    state = reduceQueueEvent(state, {
      type: 'ticket:ready',
      payload: { ticketId: 't1', ticketNumber: 'A-001' },
    } as never);
    expect(state.tickets['t1'].status).toBe('READY');

    const before = state.version;
    state = reduceQueueEvent(state, {
      type: 'station:queue-updated',
      payload: { outletId: 'o1', reason: 'PRIORITY_BUMP' },
    } as never);
    expect(state.version).toBe(before + 1);
  });

  it('ignores events for unknown tickets', () => {
    const state = reduceQueueEvent(initialQueueState, {
      type: 'ticket:ready',
      payload: { ticketId: 'missing', ticketNumber: 'A-999' },
    } as never);
    expect(state).toBe(initialQueueState);
  });
});
