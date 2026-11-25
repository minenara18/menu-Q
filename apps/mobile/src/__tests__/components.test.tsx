import React from 'react';
import { render } from '@testing-library/react-native';
import { TicketCard } from '../components/TicketCard';
import { Timer, timerColor } from '../components/Timer';
import { palette } from '../theme/tokens';
import type { QueueTicket } from '../realtime/events';

const ticket: QueueTicket = {
  id: 't1',
  ticketNumber: 'A-043',
  status: 'IN_PROGRESS' as never,
  etaMin: 6,
  etaMax: 10,
  subtickets: [{ id: 's1', stationId: 'st1', stationCode: 'BAR', status: 'IN_PROGRESS' as never }],
};

describe('key components', () => {
  it('TicketCard shows the large ticket number and station', async () => {
    const { getByLabelText, getByText } = await render(<TicketCard ticket={ticket} />);
    expect(getByLabelText('Nomor tiket A-043')).toBeTruthy();
    expect(getByText('BAR')).toBeTruthy();
  });

  it('Timer colour follows SLA thresholds', () => {
    expect(timerColor(30_000, 600_000)).toBe(palette.ready);
    expect(timerColor(400_000, 600_000)).toBe(palette.ordered);
    expect(timerColor(700_000, 600_000)).toBe(palette.cancelled);
  });

  it('Timer renders elapsed time with an accessibility label', async () => {
    const now = Date.UTC(2026, 0, 1, 0, 2, 0);
    const { getByLabelText } = await render(
      <Timer startedAt={new Date(now - 65_000)} slaMinutes={10} now={now} />,
    );
    expect(getByLabelText(/Waktu berjalan/)).toBeTruthy();
  });
});
