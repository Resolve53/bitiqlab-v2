import type { NextApiRequest, NextApiResponse } from 'next';
import { getEconomicCalendar } from '@/lib/calendar-service';
import { asyncHandler } from '@/lib/utils';

export default asyncHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { startDate, endDate, days = 30 } = req.query;

  const start = startDate
    ? String(startDate)
    : new Date(Date.now() - parseInt(String(days)) * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
  const end = endDate
    ? String(endDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

  const events = await getEconomicCalendar(start, end);

  res.status(200).json({
    success: true,
    data: {
      startDate: start,
      endDate: end,
      eventCount: events.length,
      events,
    },
  });
});
