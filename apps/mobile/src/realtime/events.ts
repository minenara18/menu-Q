import type {
  TicketCreatedEvent,
  SubTicketUpdatedEvent,
  TicketReadyEvent,
  TicketEtaUpdatedEvent,
  StationQueueUpdatedEvent,
  StockChangedEvent,
} from '@order-q/shared';
import { SubTicketStatus, TicketStatus } from '@order-q/shared';

export type QueueEvent =
  | { type: 'ticket:created'; payload: TicketCreatedEvent }
  | { type: 'subticket:updated'; payload: SubTicketUpdatedEvent }
  | { type: 'ticket:ready'; payload: TicketReadyEvent }
  | { type: 'ticket:eta-updated'; payload: TicketEtaUpdatedEvent }
  | { type: 'station:queue-updated'; payload: StationQueueUpdatedEvent }
  | { type: 'stock:changed'; payload: StockChangedEvent };

export interface QueueTicket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  etaMin?: number | null;
  etaMax?: number | null;
  subtickets: Array<{ id: string; stationId: string; stationCode?: string; status: SubTicketStatus }>;
}

export interface QueueState {
  tickets: Record<string, QueueTicket>;
  order: string[];
  version: number;
}

export const initialQueueState: QueueState = { tickets: {}, order: [], version: 0 };

/** Pure event reducer used by both the socket layer and unit tests. */
export function reduceQueueEvent(state: QueueState, event: QueueEvent): QueueState {
  switch (event.type) {
    case 'ticket:created': {
      const t = event.payload.ticket as unknown as QueueTicket;
      if (state.tickets[t.id]) return state;
      return {
        ...state,
        tickets: {
          ...state.tickets,
          [t.id]: {
            id: t.id,
            ticketNumber: t.ticketNumber,
            status: t.status,
            etaMin: t.etaMin,
            etaMax: t.etaMax,
            subtickets: (event.payload.subtickets ?? []).map((s) => ({
              id: s.id,
              stationId: s.stationId,
              stationCode: s.station?.code,
              status: s.status,
            })),
          },
        },
        order: [t.id, ...state.order],
        version: state.version + 1,
      };
    }
    case 'subticket:updated': {
      const target = Object.values(state.tickets).find((t) =>
        t.subtickets.some((s) => s.id === event.payload.subticketId),
      );
      if (!target) return state;
      return {
        ...state,
        tickets: {
          ...state.tickets,
          [target.id]: {
            ...target,
            subtickets: target.subtickets.map((s) =>
              s.id === event.payload.subticketId
                ? { ...s, status: event.payload.status }
                : s,
            ),
          },
        },
        version: state.version + 1,
      };
    }
    case 'ticket:ready': {
      const id = event.payload.ticketId;
      const target = state.tickets[id];
      if (!target) return state;
      return {
        ...state,
        tickets: { ...state.tickets, [id]: { ...target, status: TicketStatus.READY } },
        version: state.version + 1,
      };
    }
    case 'ticket:eta-updated': {
      const id = event.payload.ticketId;
      const target = state.tickets[id];
      if (!target) return state;
      return {
        ...state,
        tickets: {
          ...state.tickets,
          [id]: { ...target, etaMin: event.payload.etaMin, etaMax: event.payload.etaMax },
        },
        version: state.version + 1,
      };
    }
    case 'station:queue-updated':
    case 'stock:changed':
      // Signals that the query cache should be refreshed; queue order is
      // re-derived from the server on the next refetch.
      return { ...state, version: state.version + 1 };
    default:
      return state;
  }
}
