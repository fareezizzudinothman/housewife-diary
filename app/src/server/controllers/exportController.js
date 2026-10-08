import * as exportService from '../services/exportService.js';

export async function exportData(req, res, next) {
  try {
    const userId = req.user.id;
    const householdId = req.user.activeHouseholdId;
    
    const { format = 'json', ...options } = req.query;
    
    const data = await exportService.exportHouseholdData(householdId, userId, options);
    
    if (format === 'csv') {
      const csv = exportService.convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="housewife-diary-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="housewife-diary-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function exportStatus(req, res, next) {
  try {
    // Could implement a job status check for async exports
    res.json({ success: true, data: { status: 'not_implemented' } });
  } catch (error) {
    next(error);
  }
}